
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { projectsController } from "./projects.controller";

const router = Router();

router.use(requireAuth);

router.post("/", projectsController.create);
router.get("/", projectsController.list);
router.get("/:projectId", projectsController.getById);
router.patch("/:projectId", projectsController.update);
router.post("/:projectId/archive", projectsController.archive);
router.post("/:projectId/restore", projectsController.restore);

export default router;
