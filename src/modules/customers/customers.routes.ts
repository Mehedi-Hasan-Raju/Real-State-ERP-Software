import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";

import {
  createCustomerHandler,
  listCustomersHandler,
  getCustomerHandler,
  updateCustomerHandler,
  listArchivedCustomersHandler,
  archiveCustomerHandler,
  restoreCustomerHandler,
} from "./customers.controller";

const router = Router();

router.use(requireAuth);

// Keep this route before "/:customerId".
router.get("/archived", listArchivedCustomersHandler);

router.post("/", createCustomerHandler);
router.get("/", listCustomersHandler);

router.get("/:customerId", getCustomerHandler);
router.patch("/:customerId", updateCustomerHandler);
router.post("/:customerId/archive", archiveCustomerHandler);
router.post("/:customerId/restore", restoreCustomerHandler);

export default router;