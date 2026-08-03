import { Router } from "express";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import {
  listUsersHandler,
  getUserDetailHandler,
  updateUserStatusHandler,
  extendUserSubscriptionHandler,
  cancelUserSubscriptionHandler,
} from "@/controllers/admin/users.controller";

export const adminUserRouter = Router();

adminUserRouter.use(requireAdminAuth);

// Read access: all admin roles including SUPPORT.
adminUserRouter.get("/", requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"), listUsersHandler);
adminUserRouter.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"), getUserDetailHandler);

// Write access: SUPER_ADMIN and ADMIN only — SUPPORT is read-only by design.
adminUserRouter.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN"), updateUserStatusHandler);
adminUserRouter.patch(
  "/subscriptions/:subscriptionId/extend",
  requireRole("SUPER_ADMIN", "ADMIN"),
  extendUserSubscriptionHandler
);
adminUserRouter.patch(
  "/subscriptions/:subscriptionId/cancel",
  requireRole("SUPER_ADMIN", "ADMIN"),
  cancelUserSubscriptionHandler
);
