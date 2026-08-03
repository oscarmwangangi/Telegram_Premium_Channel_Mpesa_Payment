import { Router } from "express";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import {
  listPaymentsHandler,
  exportPaymentsHandler,
  retryFailedPaymentHandler,
} from "@/controllers/admin/payments.controller";

export const adminPaymentRouter = Router();

adminPaymentRouter.use(requireAdminAuth, requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"));
adminPaymentRouter.get("/", listPaymentsHandler);
adminPaymentRouter.get("/export", exportPaymentsHandler);
adminPaymentRouter.post(
  "/:paymentId/retry",
  requireRole("SUPER_ADMIN", "ADMIN"), // narrower than the router-level SUPPORT read access
  retryFailedPaymentHandler
);
