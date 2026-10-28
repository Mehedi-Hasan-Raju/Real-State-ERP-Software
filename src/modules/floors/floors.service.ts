import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateFloorInput, ListFloorsInput, UpdateFloorInput } from "./floors.validation";

type Actor = {
  id: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "SALES" | "ACCOUNTANT" | "CONSTRUCTION" | "VIEWER";
};

export class FloorServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "FloorServiceError";
  }
}

const canManage = (actor: Actor) =>
  ["OWNER", "ADMIN", "MANAGER"].includes(actor.role);

async function getAccessibleProjects(actor: Actor) {
  return prisma.project.findMany({
    where: {
      organizationId: actor.organizationId,
      archivedAt: null,
      ...(canManage(actor)
        ? {}
        : {
            members: {
              some: {
                userId: actor.id,
                removedAt: null,
              },
            },
          }),
    },
    select: { id: true },
  });
}

async function getFloorForActor(floorId: string, actor: Actor) {
  const floor = await prisma.floor.findFirst({
    where: {
      id: floorId,
      building: {
        project: {
          organizationId: actor.organizationId,
        },
      },
    },
    include: {
      building: {
        include: {
          project: {
            select: {
              id: true,
              organizationId: true,
              archivedAt: true,
            },
          },
        },
      },
      units: {
        where: { archivedAt: null },
        select: { id: true, unitNumber: true, status: true },
      },
    },
  });

  if (!floor) {
    throw new FloorServiceError(404, "Floor not found");
  }

  if (floor.building.project.archivedAt) {
    throw new FloorServiceError(409, "The parent project is archived");
  }

  const accessibleProjects = await getAccessibleProjects(actor);
  if (!accessibleProjects.some((project) => project.id === floor.building.project.id)) {
    throw new FloorServiceError(404, "Floor not found");
  }

  return floor;
}

async function writeAudit(
  actor: Actor,
  projectId: string,
  entityId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown,
  tx?: Prisma.TransactionClient,
) {
  await (tx ?? prisma).auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      projectId,
      entityType: "FLOOR",
      entityId,
      action,
      oldValues: oldValues == null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(oldValues)) as Prisma.InputJsonValue),
      newValues: newValues == null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(newValues)) as Prisma.InputJsonValue),
    },
  });
}

export async function createFloor(input: CreateFloorInput, actor: Actor) {
  if (!canManage(actor)) {
    throw new FloorServiceError(403, "You are not allowed to create floors");
  }

  const building = await prisma.building.findFirst({
    where: {
      id: input.buildingId,
      project: {
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      archivedAt: null,
    },
    include: {
      project: { select: { id: true } },
    },
  });

  if (!building) {
    throw new FloorServiceError(404, "Building not found");
  }

  const accessibleProjects = await getAccessibleProjects(actor);
  if (!accessibleProjects.some((project) => project.id === building.project.id)) {
    throw new FloorServiceError(404, "Building not found");
  }

  return prisma.$transaction(async (tx) => {
    const floor = await tx.floor.create({
      data: {
        buildingId: building.id,
        floorNumber: input.floorNumber,
        name: input.name,
        description: input.description,
        createdById: actor.id,
      },
    });

    await writeAudit(
      actor,
      building.project.id,
      floor.id,
      "FLOOR_CREATED",
      null,
      {
        buildingId: building.id,
        floorNumber: floor.floorNumber,
        name: floor.name,
      },
      tx,
    );

    if (input.initialUnit) {
      const unit = await tx.unit.create({
        data: {
          floorId: floor.id,
          unitNumber: input.initialUnit.unitNumber,
          ...(input.initialUnit.name
            ? { name: input.initialUnit.name }
            : {}),
          createdById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          projectId: building.project.id,
          entityType: "UNIT",
          entityId: unit.id,
          action: "UNIT_CREATED",
          oldValues: Prisma.JsonNull,
          newValues: {
            floorId: floor.id,
            unitNumber: unit.unitNumber,
            name: unit.name,
          },
        },
      });
    }

    return floor;
  });
}

export async function listFloors(input: ListFloorsInput, actor: Actor) {
  const projects = await getAccessibleProjects(actor);
  const projectIds = projects.map((project) => project.id);

    const where: Prisma.FloorWhereInput = {
    archivedAt: null,
    building: {
      projectId: {
        in: input.projectId
          ? projectIds.filter((id) => id === input.projectId)
          : projectIds,
      },
      project: { organizationId: actor.organizationId },
      ...(input.buildingId ? { id: input.buildingId } : {}),
    },
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { description: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.floor.findMany({
      where,
      include: {
        building: {
          select: {
            id: true,
            name: true,
            code: true,
            projectId: true,
          },
        },
        _count: {
          select: { units: true },
        },
      },
      orderBy: { floorNumber: input.sortOrder },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.floor.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function getFloorById(floorId: string, actor: Actor) {
  const floor = await getFloorForActor(floorId, actor);

  if (floor.archivedAt) {
    throw new FloorServiceError(404, "Floor not found");
  }

  return prisma.floor.findUnique({
    where: { id: floor.id },
    include: {
      building: {
        select: {
          id: true,
          name: true,
          code: true,
          projectId: true,
        },
      },
      units: {
        where: { archivedAt: null },
        orderBy: { unitNumber: "asc" },
      },
    },
  });
}

export async function updateFloor(
  floorId: string,
  input: UpdateFloorInput,
  actor: Actor,
) {
  if (!canManage(actor)) {
    throw new FloorServiceError(403, "You are not allowed to update floors");
  }

  const existing = await getFloorForActor(floorId, actor);

  if (existing.archivedAt) {
    throw new FloorServiceError(409, "Restore the floor before updating it");
  }

  const updated = await prisma.floor.update({
    where: { id: floorId },
    data: input,
  });

  await writeAudit(
    actor,
    existing.building.project.id,
    floorId,
    "FLOOR_UPDATED",
    {
      floorNumber: existing.floorNumber,
      name: existing.name,
      description: existing.description,
      status: existing.status,
    },
    input,
  );

  return updated;
}

export async function listArchivedFloors(actor: Actor) {
  const projects = await getAccessibleProjects(actor);

  return prisma.floor.findMany({
    where: {
      archivedAt: { not: null },
      building: { projectId: { in: projects.map((project) => project.id) } },
    },
    include: {
      building: {
        select: { id: true, name: true, code: true, projectId: true },
      },
    },
    orderBy: { archivedAt: "desc" },
  });
}

export async function archiveFloor(
  floorId: string,
  reason: string,
  actor: Actor,
) {
  if (!canManage(actor)) {
    throw new FloorServiceError(403, "You are not allowed to archive floors");
  }

  const existing = await getFloorForActor(floorId, actor);

  if (existing.archivedAt) {
    throw new FloorServiceError(409, "Floor is already archived");
  }

  if (existing.units.length > 0) {
    throw new FloorServiceError(
      409,
      "Archive or resolve the floor's active units before archiving this floor",
    );
  }

  const updated = await prisma.floor.update({
    where: { id: floorId },
    data: {
      archivedAt: new Date(),
      archivedById: actor.id,
      archiveReason: reason,
    },
  });

  await writeAudit(
    actor,
    existing.building.project.id,
    floorId,
    "FLOOR_ARCHIVED",
    { archivedAt: null },
    { archivedAt: updated.archivedAt, archiveReason: reason },
  );

  return updated;
}

export async function restoreFloor(floorId: string, actor: Actor) {
  if (!canManage(actor)) {
    throw new FloorServiceError(403, "You are not allowed to restore floors");
  }

  const existing = await getFloorForActor(floorId, actor);

  if (!existing.archivedAt) {
    throw new FloorServiceError(409, "Floor is not archived");
  }

  if (existing.building.archivedAt) {
    throw new FloorServiceError(409, "Restore the building before restoring its floor");
  }

  const updated = await prisma.floor.update({
    where: { id: floorId },
    data: {
      archivedAt: null,
      archivedById: null,
      archiveReason: null,
    },
  });

  await writeAudit(
    actor,
    existing.building.project.id,
    floorId,
    "FLOOR_RESTORED",
    { archivedAt: existing.archivedAt },
    { archivedAt: null },
  );

  return updated;
}