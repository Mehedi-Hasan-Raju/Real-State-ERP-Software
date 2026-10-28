import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { InstallmentsController } from "./installments.controller";

const router = Router();

router.use(requireAuth);

router.post("/", InstallmentsController.create);
router.get("/", InstallmentsController.list);
router.get("/:installmentId", InstallmentsController.getById);
router.patch("/:installmentId/cancel", InstallmentsController.cancel);

export default router;