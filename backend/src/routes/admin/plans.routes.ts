import { Router } from "express";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import {
  listPlansHandler,
  createPlanHandler,
  updatePlanHandler,
  disablePlanHandler,
} from "@/controllers/admin/plans.controller";

export const adminPlanRouter = Router();

adminPlanRouter.use(requireAdminAuth);

adminPlanRouter.get("/", requireRole("SUPER_ADMIN", "ADMIN", "SUPPORT"), listPlansHandler);

// Plan management is SUPER_ADMIN-only — pricing changes affect revenue
// directly and shouldn't be delegated to general ADMIN accounts.
adminPlanRouter.post("/", requireRole("SUPER_ADMIN"), createPlanHandler);
adminPlanRouter.patch("/:id", requireRole("SUPER_ADMIN"), updatePlanHandler);
adminPlanRouter.patch("/:id/disable", requireRole("SUPER_ADMIN"), disablePlanHandler);
