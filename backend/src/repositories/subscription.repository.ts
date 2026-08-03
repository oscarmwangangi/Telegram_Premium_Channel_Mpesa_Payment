import { prisma } from "@/lib/prisma";
import type { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";

export const subscriptionRepository = {
  findActiveForUser(userId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { plan: true },
    });
  },

  findLatestForUser(userId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
  },

  findPendingForUser(userId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
  },

  history(userId: string) {
    return prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: true, payments: true },
    });
  },

  createPending(params: { userId: string; planId: string }, tx: Prisma.TransactionClient = prisma) {
    return tx.subscription.create({
      data: { userId: params.userId, planId: params.planId, status: "PENDING" },
    });
  },

  /**
   * Activates a subscription. Relies on the DB-level partial unique index
   * (subscriptions_one_active_per_user) as the ultimate guarantee — if this
   * throws a unique constraint violation, the caller must treat it as "user
   * already has an active subscription" rather than a generic failure.
   */
  activate(
    id: string,
    params: { startDate: Date; endDate: Date },
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.subscription.update({
      where: { id },
      data: { status: "ACTIVE", startDate: params.startDate, endDate: params.endDate },
    });
  },

  extend(id: string, newEndDate: Date, tx: Prisma.TransactionClient = prisma) {
    return tx.subscription.update({ where: { id }, data: { endDate: newEndDate } });
  },

  cancel(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.subscription.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  },

  expire(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.subscription.update({ where: { id }, data: { status: "EXPIRED" } });
  },

  findExpiringBetween(from: Date, to: Date) {
    return prisma.subscription.findMany({
      where: { status: "ACTIVE", endDate: { gte: from, lte: to } },
      include: { user: true, plan: true },
    });
  },

  findExpired(asOf: Date) {
    return prisma.subscription.findMany({
      where: { status: "ACTIVE", endDate: { lt: asOf } },
      include: { user: true, plan: true },
    });
  },

  countByStatus(status: SubscriptionStatus) {
    return prisma.subscription.count({ where: { status } });
  },

  countByPlanCode(planCode: string) {
    return prisma.subscription.count({ where: { plan: { code: planCode }, status: "ACTIVE" } });
  },

  list(params: { status?: SubscriptionStatus; page: number; pageSize: number }) {
    const { status, page, pageSize } = params;
    const where = status ? { status } : {};

    return Promise.all([
      prisma.subscription.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: true, plan: true },
      }),
      prisma.subscription.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.subscription.findUnique({ where: { id }, include: { user: true, plan: true } });
  },
};
