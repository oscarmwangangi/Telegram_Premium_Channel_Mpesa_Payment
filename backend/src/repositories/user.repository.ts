import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const userRepository = {
  findByTelegramId(telegramId: bigint): Promise<User | null> {
    return prisma.user.findUnique({ where: { telegramId } });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  upsertByTelegramId(params: {
    telegramId: bigint;
    telegramUsername?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<User> {
    const { telegramId, ...rest } = params;
    return prisma.user.upsert({
      where: { telegramId },
      update: rest,
      create: { telegramId, ...rest },
    });
  },

  updatePhoneNumber(userId: string, phoneNumber: string): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data: { phoneNumber } });
  },

  updateEmail(userId: string, email: string): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data: { email } });
  },

  setStatus(userId: string, status: "ACTIVE" | "SUSPENDED" | "BANNED"): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data: { status } });
  },

  search(params: {
    query?: string;
    status?: "ACTIVE" | "SUSPENDED" | "BANNED";
    page: number;
    pageSize: number;
  }) {
    const { query, status, page, pageSize } = params;
    const where = {
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { phoneNumber: { contains: query } },
              { email: { contains: query, mode: "insensitive" as const } },
              { telegramUsername: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    return Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);
  },
};
