import {
  BuildingStatus,
  Prisma,
} from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../lib/prisma";
import type {
  CreateBuildingInput,
  UpdateBuildingInput,
} from "./buildings.validation";

export class BuildingServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BuildingServiceError";
  }
}

const managerRoles = ["OWNER", "ADMIN", "MANAGER"] as const;

function canManage(actor: AuthUser) {
  return managerRoles.includes(
    actor.role as (typeof managerRoles)[number],
  );
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  buildingId: string,
  projectId: string,
  action: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      projectId,
      entityType: "Building",
      entityId: buildingId,
      action,
      oldValues: oldValues as Prisma.InputJsonValue,
      newValues: newValues as Prisma.InputJsonValue,
    },
  });
}

async function ensureProjectReadAccess(
  actor: AuthUser,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: actor.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!project) {
    throw new BuildingServiceError(404, "Project not found");
  }

  if (canManage(actor)) return;

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: actor.id,
      removedAt: null,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new BuildingServiceError(404, "Project not found");
  }
}

async function getBuildingForActor(
  actor: AuthUser,
  buildingId: string,
  includeArchived = false,
) {
  const building = await prisma.building.findFirst({
    where: {
      id: buildingId,
      project: { organizationId: actor.organizationId },
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
          organizationId: true,
          archivedAt: true,
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
      archivedBy: {
        select: { id: true, name: true },
      },
    },
  });

  if (!building || building.project.archivedAt) {
    throw new BuildingServiceError(404, "Building not found");
  }

  if (!canManage(actor)) {
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: building.projectId,
        userId: actor.id,
        removedAt: null,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new BuildingServiceError(404, "Building not found");
    }
  }

  return building;
}

export const buildingsService = {
  async create(actor: AuthUser, input: CreateBuildingInput) {
    if (!canManage(actor)) {
      throw new BuildingServiceError(403, "You cannot create buildings");
    }

    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!project) {
      throw new BuildingServiceError(404, "Project not found");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const building = await tx.building.create({
          data: {
            name: input.name,
            code: input.code,
            projectId: input.projectId,
            createdById: actor.id,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.address !== undefined
              ? { address: input.address }
              : {}),
            ...(input.totalFloors !== undefined
              ? { totalFloors: input.totalFloors }
              : {}),
            ...(input.status !== undefined
              ? { status: input.status }
              : {}),
          },
        });

        await writeAudit(
          tx,
          actor,
          building.id,
          building.projectId,
          "BUILDING_CREATED",
          {},
          {
            name: building.name,
            code: building.code,
            projectId: building.projectId,
            status: building.status,
          },
        );

        return building;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BuildingServiceError(
          409,
          "A building with this code already exists in the project",
        );
      }
      throw error;
    }
  },

  async list(
    actor: AuthUser,
    query: {
      projectId?: string;
      search?: string;
      status?: BuildingStatus;
      page: number;
      limit: number;
      sortBy: "name" | "code" | "status" | "createdAt";
      sortOrder: "asc" | "desc";
    },
  ) {
    if (query.projectId) {
      await ensureProjectReadAccess(actor, query.projectId);
    }

    const where: Prisma.BuildingWhereInput = {
      project: { organizationId: actor.organizationId },
      archivedAt: null,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } },
              { address: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    if (!canManage(actor)) {
      where.project = {
        organizationId: actor.organizationId,
        members: {
          some: {
            userId: actor.id,
            removedAt: null,
          },
        },
      };
    }

    const [buildings, total] = await prisma.$transaction([
      prisma.building.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          project: {
            select: { id: true, name: true, code: true },
          },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.building.count({ where }),
    ]);

    return {
      buildings,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(actor: AuthUser, buildingId: string) {
    return getBuildingForActor(actor, buildingId);
  },

  async update(
    actor: AuthUser,
    buildingId: string,
    input: UpdateBuildingInput,
  ) {
    if (!canManage(actor)) {
      throw new BuildingServiceError(403, "You cannot update buildings");
    }

    const existing = await getBuildingForActor(actor, buildingId);

    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.building.update({
          where: { id: existing.id },
          data: input,
        });

        const changedFields = Object.keys(input);
        const oldValues: Record<string, unknown> = {};
        const newValues: Record<string, unknown> = {};

        for (const field of changedFields) {
          oldValues[field] = existing[field as keyof typeof existing];
          newValues[field] = updated[field as keyof typeof updated];
        }

        await writeAudit(
          tx,
          actor,
          updated.id,
          updated.projectId,
          input.status && input.status !== existing.status
            ? "BUILDING_UPDATED"
            : "BUILDING_UPDATED",
          oldValues,
          newValues,
        );

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BuildingServiceError(
          409,
          "A building with this code already exists in the project",
        );
      }
      throw error;
    }
  },

  async archive(
    actor: AuthUser,
    buildingId: string,
    reason: string,
  ) {
    if (!canManage(actor)) {
      throw new BuildingServiceError(403, "You cannot archive buildings");
    }

    const existing = await getBuildingForActor(actor, buildingId);

    return prisma.$transaction(async (tx) => {
      const archivedAt = new Date();

      const building = await tx.building.update({
        where: { id: existing.id },
        data: {
          archivedAt,
          archivedById: actor.id,
          archiveReason: reason,
        },
      });

      await writeAudit(
        tx,
        actor,
        building.id,
        building.projectId,
        "BUILDING_ARCHIVED",
        { archivedAt: null, archiveReason: existing.archiveReason },
        { archivedAt: archivedAt.toISOString(), archiveReason: reason },
      );

      return building;
    });
  },

  async listArchived(actor: AuthUser) {
    if (!canManage(actor)) {
      throw new BuildingServiceError(
        403,
        "You cannot view archived buildings",
      );
    }

    return prisma.building.findMany({
      where: {
        project: { organizationId: actor.organizationId },
        archivedAt: { not: null },
      },
      orderBy: { archivedAt: "desc" },
      include: {
        project: { select: { id: true, name: true, code: true } },
        archivedBy: { select: { id: true, name: true } },
      },
    });
  },

  async restore(actor: AuthUser, buildingId: string) {
    if (!["OWNER", "ADMIN"].includes(actor.role)) {
      throw new BuildingServiceError(
        403,
        "Only OWNER or ADMIN can restore buildings",
      );
    }

    const existing = await getBuildingForActor(actor, buildingId, true);

    if (!existing.archivedAt) {
      throw new BuildingServiceError(409, "Building is not archived");
    }

    const archivedAt = existing.archivedAt;

    return prisma.$transaction(async (tx) => {
      const building = await tx.building.update({
        where: { id: existing.id },
        data: {
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        },
      });

      await writeAudit(
        tx,
        actor,
        building.id,
        building.projectId,
        "BUILDING_RESTORED",
        { archivedAt: archivedAt.toISOString() },
        { archivedAt: null },
      );

      return building;
    });
  },
};