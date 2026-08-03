import { prisma } from "@/lib/prisma";
import type { ActorType } from "@prisma/client";

export const auditLogRepository = {
  record(params: {
    actorType: ActorType;
    adminUserId?: string | null;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
    ipAddress?: string | null;
  }) {
    return prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        adminUserId: params.adminUserId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as never,
        ipAddress: params.ipAddress ?? null,
      },
    });
  },

  forEntity(entityType: string, entityId: string) {
    return prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
    });
  },

  recent(limit = 50) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { adminUser: true },
    });
  },
};
