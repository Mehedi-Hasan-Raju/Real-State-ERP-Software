import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";

import {
  listNotificationsHandler,
  unreadCountHandler,
  markNotificationAsReadHandler,
  markAllNotificationsAsReadHandler,
} from "./notifications.controller";

const router = Router();

router.use(requireAuth);

// Specific routes must come before parameterized routes.
router.get("/unread-count", unreadCountHandler);
router.patch("/read-all", markAllNotificationsAsReadHandler);

router.get("/", listNotificationsHandler);
router.patch(
  "/:notificationId/read",
  markNotificationAsReadHandler,
);

export default router;