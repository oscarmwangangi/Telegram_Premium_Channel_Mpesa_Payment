import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { broadcastAnnouncement } from "@/services/notification.service";
import { auditLogRepository } from "@/repositories/audit-log.repository";

export const announcementSchema = z.object({
  subject: z.string().min(1).max(200),
  bodyHtml: z.string().min(1),
});

// Restricted to ADMIN/SUPER_ADMIN at the route level — see notification.routes.ts.
export const sendAnnouncementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { subject, bodyHtml } = req.body as z.infer<typeof announcementSchema>;

  const count = await broadcastAnnouncement({
    subject,
    bodyHtml,
    sentByAdminId: req.admin!.id,
  });

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "ANNOUNCEMENT_BROADCAST",
    entityType: "EmailNotification",
    entityId: "broadcast",
    metadata: { subject, recipientCount: count },
  });

  return ok(res, { recipientCount: count });
});
