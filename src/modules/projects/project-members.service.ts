import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../lib/prisma";

export class ProjectMemberServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectMemberServiceError";
  }
}

const managerRoles = ["OWNER", "ADMIN", "MANAGER"] as const;

function canManageProjects(actor: AuthUser) {
  return managerRoles.includes(
    actor.role as (typeof managerRoles)[number],
  );
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  projectId: string,
  userId: string,
  action: string,
  oldValues: unknown,
  newValues: unknown,
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      projectId,
      entityType: "ProjectMember",
      entityId: `${projectId}:${userId}`,
      action,
      oldValues: oldValues as Prisma.InputJsonValue,
      newValues: newValues as Prisma.InputJsonValue,
    },
  });
}

export const projectMembersService = {
  async list(actor: AuthUser, projectId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!project) {
      throw new ProjectMemberServiceError(404, "Project not found");
    }

    if (!canManageProjects(actor)) {
      const membership = await prisma.projectMember.findFirst({
        where: {
          projectId,
          userId: actor.id,
          removedAt: null,
          project: { organizationId: actor.organizationId },
        },
      });

      if (!membership) {
        throw new ProjectMemberServiceError(404, "Project not found");
      }
    }

    return prisma.projectMember.findMany({
      where: {
        projectId,
        removedAt: null,
        project: { organizationId: actor.organizationId },
      },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assignedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
    });
  },

  async assign(actor: AuthUser, projectId: string, userId: string) {
    if (!canManageProjects(actor)) {
      throw new ProjectMemberServiceError(
        403,
        "You cannot manage project assignments",
      );
    }

    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
        select: { id: true, name: true },
      });

      if (!project) {
        throw new ProjectMemberServiceError(404, "Project not found");
      }

      const employee = await tx.user.findFirst({
        where: {
          id: userId,
          organizationId: actor.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      if (!employee) {
        throw new ProjectMemberServiceError(
          404,
          "Active employee not found in your organization",
        );
      }

      const existing = await tx.projectMember.findUnique({
        where: {
          projectId_userId: { projectId, userId },
        },
      });

      if (existing && existing.removedAt === null) {
        throw new ProjectMemberServiceError(
          409,
          "Employee is already assigned to this project",
        );
      }

      const membership = existing
        ? await tx.projectMember.update({
            where: { id: existing.id },
            data: {
              assignedById: actor.id,
              assignedAt: new Date(),
              removedAt: null,
            },
            select: {
              id: true,
              projectId: true,
              userId: true,
              assignedById: true,
              assignedAt: true,
              removedAt: true,
            },
          })
        : await tx.projectMember.create({
            data: {
              projectId,
              userId,
              assignedById: actor.id,
            },
            select: {
              id: true,
              projectId: true,
              userId: true,
              assignedById: true,
              assignedAt: true,
              removedAt: true,
            },
          });

      await writeAudit(
        tx,
        actor,
        projectId,
        userId,
        "PROJECT_MEMBER_ASSIGNED",
        existing
          ? { removedAt: existing.removedAt }
          : null,
        {
          userId,
          assignedAt: membership.assignedAt.toISOString(),
          removedAt: null,
        },
      );

      await tx.notification.createMany({
        data: [
          {
            organizationId: actor.organizationId,
            recipientId: userId,
            projectId,
            type: "PROJECT_UPDATED",
            title: "New project assignment",
            message: `You have been assigned to project "${project.name}".`,
            data: { projectId },
          },
        ],
      });

      return { membership, employee };
    });
  },

  async remove(
    actor: AuthUser,
    projectId: string,
    userId: string,
  ) {
    if (!canManageProjects(actor)) {
      throw new ProjectMemberServiceError(
        403,
        "You cannot manage project assignments",
      );
    }

    return prisma.$transaction(async (tx) => {
      const membership = await tx.projectMember.findFirst({
        where: {
          projectId,
          userId,
          removedAt: null,
          project: {
            organizationId: actor.organizationId,
            archivedAt: null,
          },
        },
        select: {
          id: true,
          projectId: true,
          userId: true,
          assignedAt: true,
          removedAt: true,
        },
      });

      if (!membership) {
        throw new ProjectMemberServiceError(
          404,
          "Active project assignment not found",
        );
      }

      const removedAt = new Date();

      const updated = await tx.projectMember.update({
        where: { id: membership.id },
        data: { removedAt },
        select: {
          id: true,
          projectId: true,
          userId: true,
          assignedAt: true,
          removedAt: true,
        },
      });

      await writeAudit(
        tx,
        actor,
        projectId,
        userId,
        "PROJECT_MEMBER_REMOVED",
        { removedAt: null },
        { removedAt: removedAt.toISOString() },
      );

      return updated;
    });
  },
};