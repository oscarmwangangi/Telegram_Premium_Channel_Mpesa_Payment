import type { Response } from "express";
import { env, isProduction } from "@/config/env";

const ACCESS_COOKIE = "admin_access_token";
const REFRESH_COOKIE = "admin_refresh_token";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction, // HTTPS-only in production; allow http for local dev
  sameSite: "strict" as const,
  domain: env.COOKIE_DOMAIN,
  path: "/",
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/admin/auth", // refresh token only sent to the auth-refresh endpoint
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions, path: "/api/admin/auth" });
}

export function getAccessTokenCookie(cookies: Record<string, string>): string | undefined {
  return cookies[ACCESS_COOKIE];
}

export function getRefreshTokenCookie(cookies: Record<string, string>): string | undefined {
  return cookies[REFRESH_COOKIE];
}
