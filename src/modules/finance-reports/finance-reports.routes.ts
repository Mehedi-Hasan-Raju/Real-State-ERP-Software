import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { FinanceReportsController } from "./finance-reports.controller";

const router = Router();

router.use(requireAuth);

router.get("/summary", FinanceReportsController.summary);
router.get("/customers", FinanceReportsController.customerLedgers);
router.get(
  "/customers/:customerId/ledger",FinanceReportsController.customerLedger);

export default router;