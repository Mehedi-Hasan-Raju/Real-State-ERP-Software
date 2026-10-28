import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import * as controller from "./units.controller";

const router = Router();

router.use(requireAuth);

router.get("/archived", controller.listArchived);
router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:unitId", controller.getById);
router.patch("/:unitId", controller.update);
router.post("/:unitId/archive", controller.archive);
router.post("/:unitId/restore", controller.restore);

export default router;