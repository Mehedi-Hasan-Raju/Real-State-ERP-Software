import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { DashboardController } from "./dashboard.controller";

const router = Router();

router.use(requireAuth);

router.get("/", DashboardController.overview);

export default router;
