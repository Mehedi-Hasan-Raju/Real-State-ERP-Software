
import { Prisma } from "../../generated/prisma/client";
import type { Role } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateProjectInput,
  ProjectListQuery,
  UpdateProjectInput,
} from "./projects.validation";

export class ProjectServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProjectServiceError";
  }
}

type Actor = {
  id: string;
  role: Role;
  organizationId: string;
};

const managerRoles: Role[] = ["OWNER", "ADMIN", "MANAGER"];

const projectSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  type: true,
  status: true,
  address: true,
  city: true,
  startDate: true,
  expectedEndDate: true,
  actualEndDate: true,
  budget: true,
  organizationId: true,
  projectManagerId: true,
  createdById: true,
  archivedAt: true,
  archivedById: true,
  archiveReason: true,
  createdAt: true,
  updatedAt: true,
  projectManager: {
    select: { id: true, name: true, email: true, role: true },
  },
  _count: {
    select: {
      buildings: true,
      members: { where: { removedAt: null } },
      milestones: true,
    },
  },
} satisfies Prisma.ProjectSelect;

function ensureManager(actor: Actor) {
  if (!managerRoles.includes(actor.role)) {
    throw new ProjectServiceError("You do not have permission to modify projects", 403);
  }
}

async function ensureProjectManager(
  organizationId: string,
  userId: string | null | undefined,
) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      isActive: true,
      role: "MANAGER",
    },
    select: { id: true },
  });

  if (!user) {
    throw new ProjectServiceError(
      "Project manager must be an active Manager in your organization",
      400,
    );
  }
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    actorId: string;
    projectId: string;
    action: string;
    oldValues?: Prisma.InputJsonValue;
    newValues?: Prisma.InputJsonValue;
    details?: string;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: data.organizationId,
      actorId: data.actorId,
      projectId: data.projectId,
      entityType: "PROJECT",
      entityId: data.projectId,
      action: data.action,
      oldValues: data.oldValues,
      newValues: data.newValues,
      details: data.details,
    },
  });
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const projectsService = {
  async create(actor: Actor, input: CreateProjectInput) {
    ensureManager(actor);
    await ensureProjectManager(actor.organizationId, input.projectManagerId);

    const { budget, ...rest } = input;

    try {
      return await prisma.$transaction(async (tx) => {
        const data: Prisma.ProjectUncheckedCreateInput = {
        ...rest,
        budget: budget == null ? null : new Prisma.Decimal(budget),
        organizationId: actor.organizationId,
        createdById: actor.id,
    };

       const project = await tx.project.create({
       data,
      select: projectSelect,
    });

        await writeAudit(tx, {
          organizationId: actor.organizationId,
          actorId: actor.id,
          projectId: project.id,
          action: "PROJECT_CREATED",
          newValues: toAuditJson(project),
        });

        const recipients = await tx.user.findMany({
          where: {
            organizationId: actor.organizationId,
            isActive: true,
            role: { in: ["OWNER", "ADMIN", "MANAGER"] },
            id: { not: actor.id },
          },
          select: { id: true },
        });

        if (recipients.length) {
          await tx.notification.createMany({
            data: recipients.map((recipient) => ({
              organizationId: actor.organizationId,
              recipientId: recipient.id,
              projectId: project.id,
              type: "PROJECT_CREATED",
              title: "New project created",
              message: `${project.name} (${project.code}) was created.`,
            })),
          });
        }

        return project;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ProjectServiceError(
          "A project with this code already exists in your organization",
          409,
        );
      }
      throw error;
    }
  },

  async list(actor: Actor, query: ProjectListQuery) {
    const {
      page,
      limit,
      search,
      status,
      type,
      projectManagerId,
      startDateFrom,
      startDateTo,
      sortBy,
      sortOrder,
      archived,
    } = query;

    const where: Prisma.ProjectWhereInput = {
      organizationId: actor.organizationId,
      archivedAt: archived === "true" ? { not: null } : null,
    };

    // OWNER/ADMIN/MANAGER can view all projects in their organization.
    // Other roles can only view projects they are actively assigned to.
    if (!managerRoles.includes(actor.role)) {
      where.members = {
        some: {
          userId: actor.id,
          removedAt: null,
        },
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) where.status = status;
    if (type) where.type = type;
    if (projectManagerId) where.projectManagerId = projectManagerId;

    if (startDateFrom || startDateTo) {
      where.startDate = {
        ...(startDateFrom ? { gte: new Date(startDateFrom) } : {}),
        ...(startDateTo ? { lte: new Date(startDateTo) } : {}),
      };
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        select: projectSelect,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getById(actor: Actor, projectId: string) {
    const where: Prisma.ProjectWhereInput = {
      id: projectId,
      organizationId: actor.organizationId,
      archivedAt: null,
    };

    if (!managerRoles.includes(actor.role)) {
      where.members = {
        some: {
          userId: actor.id,
          removedAt: null,
        },
      };
    }

    const project = await prisma.project.findFirst({
      where,
      select: projectSelect,
    });

    if (!project) {
      // Return 404 for both nonexistent and unauthorized projects to avoid
      // revealing another organization's project IDs.
      throw new ProjectServiceError("Project not found", 404);
    }

    return project;
  },

  async update(
    actor: Actor,
    projectId: string,
    input: UpdateProjectInput,
  ) {
    ensureManager(actor);

    const current = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
    });

    if (!current) {
      throw new ProjectServiceError("Project not found", 404);
    }

    if (input.projectManagerId !== undefined) {
      await ensureProjectManager(actor.organizationId, input.projectManagerId);
    }

    const { budget, ...rest } = input;
    const data: Prisma.ProjectUncheckedUpdateInput = { ...rest };

    if (budget !== undefined) {
      data.budget = budget === null ? null : new Prisma.Decimal(budget);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.project.update({
          where: { id: current.id },
          data,
          select: projectSelect,
        });

        await writeAudit(tx, {
          organizationId: actor.organizationId,
          actorId: actor.id,
          projectId: current.id,
          action:
            input.status !== undefined && input.status !== current.status
              ? "PROJECT_STATUS_CHANGED"
              : "PROJECT_UPDATED",
          oldValues: toAuditJson(current),
          newValues: toAuditJson(updated),
        });

        if (input.status !== undefined && input.status !== current.status) {
          const recipients = await tx.user.findMany({
            where: {
              organizationId: actor.organizationId,
              isActive: true,
              id: { not: actor.id },
            },
            select: { id: true },
          });

          if (recipients.length) {
            await tx.notification.createMany({
              data: recipients.map((recipient) => ({
                organizationId: actor.organizationId,
                recipientId: recipient.id,
                projectId: current.id,
                type: "PROJECT_STATUS_CHANGED",
                title: "Project status changed",
                message: `${updated.name}: ${current.status} → ${updated.status}`,
              })),
            });
          }
        }

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ProjectServiceError(
          "A project with this code already exists in your organization",
          409,
        );
      }
      throw error;
    }
  },

  async archive(actor: Actor, projectId: string, reason: string) {
    ensureManager(actor);

    return prisma.$transaction(async (tx) => {
      const current = await tx.project.findFirst({
        where: {
          id: projectId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
      });

      if (!current) {
        throw new ProjectServiceError("Project not found", 404);
      }

      const archived = await tx.project.update({
        where: { id: current.id },
        data: {
          archivedAt: new Date(),
          archivedById: actor.id,
          archiveReason: reason,
        },
        select: projectSelect,
      });

      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        projectId: current.id,
        action: "PROJECT_ARCHIVED",
        oldValues: toAuditJson(current),
        newValues: toAuditJson(archived),
        details: reason,
      });
      
     const recipients = await tx.user.findMany({
  where: {
    organizationId: actor.organizationId,
    isActive: true,
    id: { not: actor.id },
  },
  select: { id: true },
});

if (recipients.length > 0) {
  await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      organizationId: actor.organizationId,
      recipientId: recipient.id,
      projectId: current.id,
      type: "PROJECT_ARCHIVED",
      title: "Project archived",
      message: `Project "${current.name}" has been archived.`,
      data: { projectId: current.id },
    })),
  });
}

      return archived;
    });
  },

  async restore(actor: Actor, projectId: string) {
    if (!["OWNER", "ADMIN"].includes(actor.role)) {
      throw new ProjectServiceError("Only OWNER or ADMIN can restore projects", 403);
    }

    return prisma.$transaction(async (tx) => {
      const current = await tx.project.findFirst({
        where: {
          id: projectId,
          organizationId: actor.organizationId,
          archivedAt: { not: null },
        },
      });

      if (!current) {
        throw new ProjectServiceError("Archived project not found", 404);
      }

      const restored = await tx.project.update({
        where: { id: current.id },
        data: {
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        },
        select: projectSelect,
      });

      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        projectId: current.id,
        action: "PROJECT_RESTORED",
        oldValues: toAuditJson(current),
        newValues: toAuditJson(restored),
      });
     
     const recipients = await tx.user.findMany({
  where: {
    organizationId: actor.organizationId,
    isActive: true,
    id: { not: actor.id },
  },
  select: { id: true },
});

if (recipients.length > 0) {
  await tx.notification.createMany({
    data: recipients.map((recipient) => ({
      organizationId: actor.organizationId,
      recipientId: recipient.id,
      projectId: restored.id,
      type: "PROJECT_RESTORED",
      title: "Project restored",
      message: `Project "${restored.name}" has been restored.`,
      data: { projectId: restored.id },
    })),
  });
}


      return restored;
    });
  },
};
