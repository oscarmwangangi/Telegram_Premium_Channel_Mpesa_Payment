import { adminRepository, adminSessionRepository } from "@/repositories/admin.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { hashPassword, verifyPassword } from "@/utils/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTtlToDate,
  signAccessToken,
} from "@/lib/jwt";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@prisma/client";

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function login(email: string, password: string, ctx: RequestContext) {
  const admin = await adminRepository.findByEmail(email);

  // Deliberately identical error/timing path whether the email doesn't
  // exist or the password is wrong, so login failures can't be used to
  // enumerate valid admin email addresses.
  if (!admin) {
    await verifyPassword(
      "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      password
    ).catch(() => false);
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!admin.isActive) {
    throw new ForbiddenError("This admin account has been deactivated");
  }

  const validPassword = await verifyPassword(admin.passwordHash, password);
  if (!validPassword) {
    await auditLogRepository.record({
      actorType: "ADMIN",
      adminUserId: admin.id,
      action: "LOGIN_FAILED",
      entityType: "AdminUser",
      entityId: admin.id,
      ipAddress: ctx.ipAddress,
    });
    throw new UnauthorizedError("Invalid email or password");
  }

  const accessToken = signAccessToken({ sub: admin.id, email: admin.email, role: admin.role });
  const { token: refreshToken, hash } = generateRefreshToken();

  await adminSessionRepository.create({
    adminUserId: admin.id,
    refreshTokenHash: hash,
    expiresAt: refreshTtlToDate(),
    userAgent: ctx.userAgent,
    ipAddress: ctx.ipAddress,
  });

  await adminRepository.updateLastLogin(admin.id);
  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: admin.id,
    action: "LOGIN_SUCCESS",
    entityType: "AdminUser",
    entityId: admin.id,
    ipAddress: ctx.ipAddress,
  });

  return {
    accessToken,
    refreshToken,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  };
}

/**
 * Refresh token rotation: every use of a refresh token invalidates it and
 * issues a new one. If a revoked/already-used token is presented again,
 * that's a strong signal of token theft — all sessions for the admin are
 * revoked defensively.
 */
export async function refreshSession(refreshToken: string, ctx: RequestContext) {
  const hash = hashRefreshToken(refreshToken);
  const session = await adminSessionRepository.findByHash(hash);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    if (session?.revokedAt) {
      logger.warn(
        { adminUserId: session.adminUserId },
        "Reuse of revoked refresh token detected — revoking all sessions"
      );
      await adminSessionRepository.revokeAllForAdmin(session.adminUserId);
    }
    throw new UnauthorizedError("Session expired or invalid. Please log in again.");
  }

  const admin = await adminRepository.findById(session.adminUserId);
  if (!admin || !admin.isActive) {
    throw new UnauthorizedError("Account no longer active");
  }

  await adminSessionRepository.revoke(session.id);

  const accessToken = signAccessToken({ sub: admin.id, email: admin.email, role: admin.role });
  const { token: newRefreshToken, hash: newHash } = generateRefreshToken();

  await adminSessionRepository.create({
    adminUserId: admin.id,
    refreshTokenHash: newHash,
    expiresAt: refreshTtlToDate(),
    userAgent: ctx.userAgent,
    ipAddress: ctx.ipAddress,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const session = await adminSessionRepository.findByHash(hashRefreshToken(refreshToken));
  if (session && !session.revokedAt) {
    await adminSessionRepository.revoke(session.id);
  }
}

export async function createAdmin(params: {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
  createdByAdminId?: string;
}) {
  const existing = await adminRepository.findByEmail(params.email);
  if (existing) throw new ValidationError("An admin with this email already exists");

  if (params.password.length < 12) {
    throw new ValidationError("Password must be at least 12 characters");
  }

  const passwordHash = await hashPassword(params.password);
  const admin = await adminRepository.create({
    email: params.email,
    passwordHash,
    name: params.name,
    role: params.role,
  });

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: params.createdByAdminId ?? null,
    action: "ADMIN_CREATED",
    entityType: "AdminUser",
    entityId: admin.id,
    metadata: { email: admin.email, role: admin.role },
  });

  return admin;
}
