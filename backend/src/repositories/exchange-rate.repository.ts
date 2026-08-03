import { prisma } from "@/lib/prisma";

export const exchangeRateRepository = {
  latest(baseCurrency: "USD" | "KES", targetCurrency: "USD" | "KES") {
    return prisma.exchangeRateSnapshot.findFirst({
      where: { baseCurrency, targetCurrency },
      orderBy: { fetchedAt: "desc" },
    });
  },

  save(params: {
    baseCurrency: "USD" | "KES";
    targetCurrency: "USD" | "KES";
    rate: number;
    source: string;
  }) {
    return prisma.exchangeRateSnapshot.create({ data: params });
  },
};
