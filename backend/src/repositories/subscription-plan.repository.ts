import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan } from "@prisma/client";

export const subscriptionPlanRepository = {
  findByCode(code: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findUnique({ where: { code } });
  },

  findActiveById(id: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findFirst({ where: { id, isActive: true } });
  },

  listActive(): Promise<SubscriptionPlan[]> {
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceUsd: "asc" },
    });
  },

  listAll(): Promise<SubscriptionPlan[]> {
    return prisma.subscriptionPlan.findMany({ orderBy: { priceUsd: "asc" } });
  },

  findById(id: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findUnique({ where: { id } });
  },

  create(params: {
    code: string;
    name: string;
    description?: string;
    priceUsd: number;
    durationDays: number;
  }): Promise<SubscriptionPlan> {
    return prisma.subscriptionPlan.create({ data: params });
  },

  update(
    id: string,
    params: Partial<{
      name: string;
      description: string;
      priceUsd: number;
      durationDays: number;
      isActive: boolean;
    }>
  ): Promise<SubscriptionPlan> {
    return prisma.subscriptionPlan.update({ where: { id }, data: params });
  },
};
