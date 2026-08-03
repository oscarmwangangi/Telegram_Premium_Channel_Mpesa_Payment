import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "@/config/env";
import { UnauthorizedError } from "@/lib/errors";
import type { AdminRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string; // admin user id
  email: string;
  role: AdminRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired session");
  }
}

/**
 * Refresh tokens are opaque random values, NOT JWTs. Only their SHA-256
 * hash is ever stored (in AdminSession.refreshTokenHash) — if the database
 * were ever leaked, the raw tokens (which grant re-authentication) would
 * not be recoverable from it, the same principle as password hashing.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("hex");
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTtlToDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : "d";
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
  return new Date(Date.now() + amount * multiplier);
}
