import { prisma } from "@/lib/prisma";
import type { Payment, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";

export const paymentRepository = {
  create(
    params: {
      userId: string;
      subscriptionId?: string | null;
      planId: string;
      method: PaymentMethod;
      amount: number;
      currency: "KES" | "USD";
      amountUsd: number;
      exchangeRate?: number | null;
    },
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.payment.create({ data: params });
  },

  findById(id: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: { transactions: true, plan: true },
    });
  },

  linkToSubscription(id: string, subscriptionId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.payment.update({ where: { id }, data: { subscriptionId } });
  },

  markSuccess(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.payment.update({
      where: { id },
      data: { status: "SUCCESS", completedAt: new Date() },
    });
  },

  markFailed(id: string, reason: string, tx: Prisma.TransactionClient = prisma) {
    return tx.payment.update({
      where: { id },
      data: { status: "FAILED", completedAt: new Date(), failureReason: reason },
    });
  },

  list(params: {
    method?: PaymentMethod;
    status?: PaymentStatus;
    page: number;
    pageSize: number;
  }) {
    const { method, status, page, pageSize } = params;
    const where = { ...(method ? { method } : {}), ...(status ? { status } : {}) };

    return Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: true, plan: true, transactions: true },
      }),
      prisma.payment.count({ where }),
    ]);
  },

  listForUser(userId: string) {
    return prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: true, transactions: true },
    });
  },

  revenueBetween(from: Date, to: Date) {
    return prisma.payment.aggregate({
      where: { status: "SUCCESS", completedAt: { gte: from, lte: to } },
      _sum: { amountUsd: true },
      _count: true,
    });
  },
};
