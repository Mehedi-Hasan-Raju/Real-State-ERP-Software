import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { projectMembersController } from "./project-members.controller";

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get("/", projectMembersController.list);
router.post("/", projectMembersController.assign);
router.delete("/:userId", projectMembersController.remove);

export default router;