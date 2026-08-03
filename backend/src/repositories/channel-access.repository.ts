import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const channelAccessRepository = {
  create(
    params: {
      userId: string;
      subscriptionId: string;
      channelId: string;
      inviteLink: string;
      inviteLinkExpiresAt: Date;
    },
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.telegramChannelAccess.create({
      data: { ...params, status: "INVITED" },
    });
  },

  markJoined(id: string) {
    return prisma.telegramChannelAccess.update({
      where: { id },
      data: { status: "JOINED", joinedAt: new Date() },
    });
  },

  markRevoked(id: string) {
    return prisma.telegramChannelAccess.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  },

  findActiveForSubscription(subscriptionId: string) {
    return prisma.telegramChannelAccess.findFirst({
      where: { subscriptionId, status: { in: ["INVITED", "JOINED"] } },
    });
  },

  findByUser(userId: string) {
    return prisma.telegramChannelAccess.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
};
