import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import * as controller from "./floors.controller";

const router = Router();

router.use(requireAuth);

router.get("/archived", controller.listArchived);
router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:floorId", controller.getById);
router.patch("/:floorId", controller.update);
router.post("/:floorId/archive", controller.archive);
router.post("/:floorId/restore", controller.restore);

export default router;