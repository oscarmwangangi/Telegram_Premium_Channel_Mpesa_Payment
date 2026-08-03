import { Router } from "express";
import { validateBody } from "@/middleware/validate";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import { announcementSchema, sendAnnouncementHandler } from "@/controllers/notification.controller";

export const notificationRouter = Router();

notificationRouter.post(
  "/announcements",
  requireAdminAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  validateBody(announcementSchema),
  sendAnnouncementHandler
);
