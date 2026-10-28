import { prisma } from "../../lib/prisma";
import type { ListNotificationsInput } from "./notifications.validation";

export type NotificationActor = {
  id: string;
  organizationId: string;
};

export class NotificationServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationServiceError";
  }
}

export async function listNotifications(
  actor: NotificationActor,
  input: ListNotificationsInput,
) {
  const skip = (input.page - 1) * input.limit;

  const where = {
    organizationId: actor.organizationId,
    recipientId: actor.id,
    ...(input.unreadOnly === "true" ? { readAt: null } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
    }),
    prisma.notification.count({ where }),
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

export async function getUnreadNotificationCount(
  actor: NotificationActor,
) {
  const count = await prisma.notification.count({
    where: {
      organizationId: actor.organizationId,
      recipientId: actor.id,
      readAt: null,
    },
  });

  return { unreadCount: count };
}

export async function markNotificationAsRead(
  actor: NotificationActor,
  notificationId: string,
) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      organizationId: actor.organizationId,
      recipientId: actor.id,
    },
  });

  if (!notification) {
    throw new NotificationServiceError(
      404,
      "Notification not found",
    );
  }

  if (notification.readAt === null) {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        organizationId: actor.organizationId,
        recipientId: actor.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  return prisma.notification.findFirstOrThrow({
    where: {
      id: notificationId,
      organizationId: actor.organizationId,
      recipientId: actor.id,
    },
  });
}

export async function markAllNotificationsAsRead(
  actor: NotificationActor,
) {
  const result = await prisma.notification.updateMany({
    where: {
      organizationId: actor.organizationId,
      recipientId: actor.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { updatedCount: result.count };
}