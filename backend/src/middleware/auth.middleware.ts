import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/lib/jwt";
import { getAccessTokenCookie } from "@/utils/cookies";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { AdminRole } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: { id: string; email: string; role: AdminRole };
    }
  }
}

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getAccessTokenCookie(req.cookies ?? {});
  if (!token) {
    return next(new UnauthorizedError("Not authenticated"));
  }

  try {
    const payload = verifyAccessToken(token);
    req.admin = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * RBAC gate. Must run after requireAdminAuth. Role hierarchy is explicit,
 * not inferred — SUPER_ADMIN > ADMIN > SUPPORT — callers list exactly which
 * roles are permitted per route rather than relying on a numeric comparison
 * that's easy to get backwards.
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) {
      return next(new UnauthorizedError("Not authenticated"));
    }
    if (!allowedRoles.includes(req.admin.role)) {
      return next(new ForbiddenError("You do not have permission to perform this action"));
    }
    next();
  };
}
