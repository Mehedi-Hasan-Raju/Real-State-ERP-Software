import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { employeesController } from "./employees.controller";

const router = Router();

router.use(requireAuth);

router.post("/", employeesController.create);
router.get("/", employeesController.list);

export default router;