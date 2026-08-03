import { Router } from "express";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import { getDashboardStatsHandler } from "@/controllers/admin/dashboard.controller";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(requireAdminAuth, requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"));
adminDashboardRouter.get("/stats", getDashboardStatsHandler);
