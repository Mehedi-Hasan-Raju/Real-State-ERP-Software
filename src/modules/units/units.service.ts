import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateUnitInput,
  ListUnitsInput,
  UpdateUnitInput,
} from "./units.validation";

type Actor = {
  id: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "SALES" | "ACCOUNTANT" | "CONSTRUCTION" | "VIEWER";
};

const canManage = (actor: Actor) =>
  ["OWNER", "ADMIN", "MANAGER"].includes(actor.role);

export class UnitServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "UnitServiceError";
  }
}

async function getAccessibleProjectIds(actor: Actor) {
  const projects = await prisma.project.findMany({
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

  return projects.map((project) => project.id);
}

async function getUnitForActor(unitId: string, actor: Actor) {
  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      floor: {
        building: {
          project: {
            organizationId: actor.organizationId,
          },
        },
      },
    },
    include: {
      floor: {
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
        },
      },
    },
  });

  if (!unit) {
    throw new UnitServiceError(404, "Unit not found");
  }

  const project = unit.floor.building.project;

  if (project.archivedAt) {
    throw new UnitServiceError(409, "The parent project is archived");
  }

  if (unit.floor.building.archivedAt) {
    throw new UnitServiceError(409, "The parent building is archived");
  }

  const projectIds = await getAccessibleProjectIds(actor);

  if (!projectIds.includes(project.id)) {
    throw new UnitServiceError(404, "Unit not found");
  }

  return unit;
}

async function writeAudit(
  actor: Actor,
  projectId: string,
  unitId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown,
) {
  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      projectId,
      entityType: "UNIT",
      entityId: unitId,
      action,
      oldValues:
        oldValues == null
          ? Prisma.JsonNull
          : (JSON.parse(JSON.stringify(oldValues)) as Prisma.InputJsonValue),
      newValues:
        newValues == null
          ? Prisma.JsonNull
          : (JSON.parse(JSON.stringify(newValues)) as Prisma.InputJsonValue),
    },
  });
}

export async function createUnit(input: CreateUnitInput, actor: Actor) {
  if (!canManage(actor)) {
    throw new UnitServiceError(403, "You are not allowed to create units");
  }

  const floor = await prisma.floor.findFirst({
    where: {
      id: input.floorId,
      archivedAt: null,
      building: {
        archivedAt: null,
        project: {
          organizationId: actor.organizationId,
          archivedAt: null,
        },
      },
    },
    include: {
      building: {
        include: {
          project: { select: { id: true } },
        },
      },
    },
  });

  if (!floor) {
    throw new UnitServiceError(404, "Floor not found");
  }

  const projectIds = await getAccessibleProjectIds(actor);

  if (!projectIds.includes(floor.building.project.id)) {
    throw new UnitServiceError(404, "Floor not found");
  }

  const unit = await prisma.unit.create({
    data: {
      floorId: floor.id,
      unitNumber: input.unitNumber,
      name: input.name,
      description: input.description,
      area: input.area,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      price: input.price,
      createdById: actor.id,
    },
  });

  await writeAudit(
    actor,
    floor.building.project.id,
    unit.id,
    "UNIT_CREATED",
    null,
    {
      floorId: floor.id,
      unitNumber: unit.unitNumber,
      area: unit.area,
      price: unit.price,
      status: unit.status,
    },
  );

  return unit;
}

export async function listUnits(input: ListUnitsInput, actor: Actor) {
  const projectIds = await getAccessibleProjectIds(actor);

  const where: Prisma.UnitWhereInput = {
    archivedAt: null,
    floor: {
      archivedAt: null,
      building: {
        archivedAt: null,
        projectId: {
          in: input.projectId
            ? projectIds.filter((id) => id === input.projectId)
            : projectIds,
        },
        project: { organizationId: actor.organizationId },
        ...(input.buildingId ? { id: input.buildingId } : {}),
      },
      ...(input.floorId ? { id: input.floorId } : {}),
    },
    ...(input.status ? { status: input.status } : {}),
    ...(input.minPrice !== undefined || input.maxPrice !== undefined
      ? {
          price: {
            ...(input.minPrice !== undefined ? { gte: input.minPrice } : {}),
            ...(input.maxPrice !== undefined ? { lte: input.maxPrice } : {}),
          },
        }
      : {}),
    ...(input.minArea !== undefined || input.maxArea !== undefined
      ? {
          area: {
            ...(input.minArea !== undefined ? { gte: input.minArea } : {}),
            ...(input.maxArea !== undefined ? { lte: input.maxArea } : {}),
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { unitNumber: { contains: input.search, mode: "insensitive" } },
            { name: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.unit.findMany({
      where,
      include: {
        floor: {
          select: {
            id: true,
            floorNumber: true,
            name: true,
            building: {
              select: {
                id: true,
                name: true,
                code: true,
                projectId: true,
              },
            },
          },
        },
      },
      orderBy: { [input.sortBy]: input.sortOrder },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.unit.count({ where }),
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

export async function getUnitById(unitId: string, actor: Actor) {
  const unit = await getUnitForActor(unitId, actor);

  if (unit.archivedAt) {
    throw new UnitServiceError(404, "Unit not found");
  }

  return prisma.unit.findUnique({
    where: { id: unit.id },
    include: {
      floor: {
        select: {
          id: true,
          floorNumber: true,
          name: true,
          building: {
            select: {
              id: true,
              name: true,
              code: true,
              projectId: true,
            },
          },
        },
      },
    },
  });
}

export async function updateUnit(
  unitId: string,
  input: UpdateUnitInput,
  actor: Actor,
) {
  if (!canManage(actor)) {
    throw new UnitServiceError(403, "You are not allowed to update units");
  }

  const existing = await getUnitForActor(unitId, actor);

  if (existing.archivedAt) {
    throw new UnitServiceError(409, "Restore the unit before updating it");
  }

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: input,
  });

  await writeAudit(
    actor,
    existing.floor.building.project.id,
    unitId,
    "UNIT_UPDATED",
    {
      unitNumber: existing.unitNumber,
      name: existing.name,
      area: existing.area,
      bedrooms: existing.bedrooms,
      bathrooms: existing.bathrooms,
      price: existing.price,
      status: existing.status,
    },
    input,
  );

  return updated;
}

export async function listArchivedUnits(actor: Actor) {
  const projectIds = await getAccessibleProjectIds(actor);

  return prisma.unit.findMany({
    where: {
      archivedAt: { not: null },
      floor: {
        building: {
          projectId: { in: projectIds },
        },
      },
    },
    include: {
      floor: {
        select: {
          id: true,
          floorNumber: true,
          building: {
            select: { id: true, name: true, code: true, projectId: true },
          },
        },
      },
    },
    orderBy: { archivedAt: "desc" },
  });
}

export async function archiveUnit(
  unitId: string,
  reason: string,
  actor: Actor,
) {
  if (!canManage(actor)) {
    throw new UnitServiceError(403, "You are not allowed to archive units");
  }

  const existing = await getUnitForActor(unitId, actor);

  if (existing.archivedAt) {
    throw new UnitServiceError(409, "Unit is already archived");
  }

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: {
      archivedAt: new Date(),
      archivedById: actor.id,
      archiveReason: reason,
    },
  });

  await writeAudit(
    actor,
    existing.floor.building.project.id,
    unitId,
    "UNIT_ARCHIVED",
    { archivedAt: null },
    { archivedAt: updated.archivedAt, archiveReason: reason },
  );

  return updated;
}

export async function restoreUnit(unitId: string, actor: Actor) {
  if (!canManage(actor)) {
    throw new UnitServiceError(403, "You are not allowed to restore units");
  }

  const existing = await getUnitForActor(unitId, actor);

  if (!existing.archivedAt) {
    throw new UnitServiceError(409, "Unit is not archived");
  }

  if (existing.floor.archivedAt) {
    throw new UnitServiceError(409, "Restore the floor before restoring its unit");
  }

  if (existing.floor.building.archivedAt) {
    throw new UnitServiceError(409, "Restore the building before restoring its unit");
  }

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: {
      archivedAt: null,
      archivedById: null,
      archiveReason: null,
    },
  });

  await writeAudit(
    actor,
    existing.floor.building.project.id,
    unitId,
    "UNIT_RESTORED",
    { archivedAt: existing.archivedAt },
    { archivedAt: null },
  );

  return updated;
}