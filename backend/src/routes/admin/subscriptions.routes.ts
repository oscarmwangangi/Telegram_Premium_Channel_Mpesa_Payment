import { Router } from "express";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import {
  listSubscriptionsHandler,
  listUpcomingRenewalsHandler,
} from "@/controllers/admin/subscriptions.controller";

export const adminSubscriptionRouter = Router();

adminSubscriptionRouter.use(requireAdminAuth, requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"));
adminSubscriptionRouter.get("/", listSubscriptionsHandler);
adminSubscriptionRouter.get("/upcoming-renewals", listUpcomingRenewalsHandler);
