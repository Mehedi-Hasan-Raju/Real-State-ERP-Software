import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { buildingsController } from "./buildings.controller";

const router = Router();

router.use(requireAuth);

// Keep this route before "/:buildingId"
router.get("/archived", buildingsController.listArchived);

router.post("/", buildingsController.create);
router.get("/", buildingsController.list);

router.get("/:buildingId", buildingsController.getById);
router.patch("/:buildingId", buildingsController.update);

router.post("/:buildingId/archive", buildingsController.archive);
router.post("/:buildingId/restore", buildingsController.restore);

export default router;