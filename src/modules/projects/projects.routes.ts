
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { projectsController } from "./projects.controller";
import projectMembersRoutes from "./project-members.routes";

const router = Router();

router.use(requireAuth);

router.post("/", projectsController.create);
router.get("/", projectsController.list);
router.get("/:projectId", projectsController.getById);
router.patch("/:projectId", projectsController.update);
router.post("/:projectId/archive", projectsController.archive);
router.post("/:projectId/restore", projectsController.restore);
router.use("/:projectId/members", projectMembersRoutes);

export default router;
