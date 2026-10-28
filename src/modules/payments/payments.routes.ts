import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { PaymentsController } from "./payments.controller";

const router = Router();

router.use(requireAuth);

router.post("/", PaymentsController.create);
router.get("/", PaymentsController.list);
router.get("/:paymentId", PaymentsController.getById);

export default router;