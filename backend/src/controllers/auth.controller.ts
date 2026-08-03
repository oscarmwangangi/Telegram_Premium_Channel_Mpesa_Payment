import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok, created } from "@/lib/http-response";
import { login, logout, refreshSession, createAdmin } from "@/services/admin-auth.service";
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from "@/utils/cookies";
import { adminRepository } from "@/repositories/admin.repository";
import { UnauthorizedError } from "@/lib/errors";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const result = await login(email, password, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  setAuthCookies(res, result.accessToken, result.refreshToken);
  return ok(res, { admin: result.admin });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenCookie(req.cookies ?? {});
  if (!refreshToken) throw new UnauthorizedError("No session to refresh");

  const result = await refreshSession(refreshToken, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  setAuthCookies(res, result.accessToken, result.refreshToken);
  return ok(res, { refreshed: true });
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenCookie(req.cookies ?? {});
  await logout(refreshToken);
  clearAuthCookies(res);
  return ok(res, { loggedOut: true });
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const admin = await adminRepository.findById(req.admin!.id);
  if (!admin) throw new UnauthorizedError("Session no longer valid");
  return ok(res, {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    lastLoginAt: admin.lastLoginAt,
  });
});

export const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT"]),
});

// Restricted to SUPER_ADMIN at the route level via requireRole — see auth.routes.ts.
export const createAdminHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof createAdminSchema>;
  const admin = await createAdmin({ ...body, createdByAdminId: req.admin!.id });
  return created(res, { id: admin.id, email: admin.email, name: admin.name, role: admin.role });
});
