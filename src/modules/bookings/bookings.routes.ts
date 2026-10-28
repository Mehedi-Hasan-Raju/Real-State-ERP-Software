import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { BookingsController } from "./bookings.controller";

const router = Router();

router.use(requireAuth);

router.post("/", BookingsController.create);
router.get("/", BookingsController.list);
router.get("/:bookingId", BookingsController.getById);
router.patch("/:bookingId/status", BookingsController.updateStatus);

export default router;