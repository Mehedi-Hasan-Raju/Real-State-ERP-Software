import type { Request, Response } from "express";
import { ZodError } from "zod";

import {
  NotificationServiceError,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "./notifications.service";

import { listNotificationsSchema } from "./notifications.validation";

function getActor(req: Request) {
  if (!req.user) {
    throw new NotificationServiceError(
      401,
      "Authentication required",
    );
  }

  return {
    id: req.user.id,
    organizationId: req.user.organizationId,
  };
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      errors: error.issues,
    });
  }

  if (error instanceof NotificationServiceError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  console.error("Notification API error:", error);

  return res.status(500).json({
    message: "Internal server error",
  });
}

export async function listNotificationsHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const input = listNotificationsSchema.parse(req.query);
    const result = await listNotifications(actor, input);

    return res.status(200).json({
      message: "Notifications retrieved successfully",
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function unreadCountHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const result = await getUnreadNotificationCount(actor);

    return res.status(200).json({
      message: "Unread notification count retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function markNotificationAsReadHandler(
  req: Request<{ notificationId: string }>,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const notification = await markNotificationAsRead(
      actor,
      req.params.notificationId!,
    );

    return res.status(200).json({
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function markAllNotificationsAsReadHandler(
  req: Request,
  res: Response,
) {
  try {
    const actor = getActor(req);
    const result = await markAllNotificationsAsRead(actor);

    return res.status(200).json({
      message: "Notifications marked as read",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}