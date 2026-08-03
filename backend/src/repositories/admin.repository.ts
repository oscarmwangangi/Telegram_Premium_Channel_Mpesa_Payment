import { prisma } from "@/lib/prisma";
import type { AdminRole, AdminUser } from "@prisma/client";

export const adminRepository = {
  findByEmail(email: string): Promise<AdminUser | null> {
    return prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  },

  findById(id: string): Promise<AdminUser | null> {
    return prisma.adminUser.findUnique({ where: { id } });
  },

  create(params: { email: string; passwordHash: string; name: string; role: AdminRole }) {
    return prisma.adminUser.create({
      data: { ...params, email: params.email.toLowerCase() },
    });
  },

  updateLastLogin(id: string) {
    return prisma.adminUser.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },

  setActive(id: string, isActive: boolean) {
    return prisma.adminUser.update({ where: { id }, data: { isActive } });
  },

  list() {
    return prisma.adminUser.findMany({ orderBy: { createdAt: "desc" } });
  },
};

export const adminSessionRepository = {
  create(params: {
    adminUserId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    return prisma.adminSession.create({ data: params });
  },

  findByHash(refreshTokenHash: string) {
    return prisma.adminSession.findUnique({ where: { refreshTokenHash } });
  },

  revoke(id: string) {
    return prisma.adminSession.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeAllForAdmin(adminUserId: string) {
    return prisma.adminSession.updateMany({
      where: { adminUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
