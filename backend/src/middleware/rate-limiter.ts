import rateLimit from "express-rate-limit";
import { env } from "@/config/env";

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limit on checkout initiation specifically — this is what stops a
// user (or bot) from spamming STK pushes, which the original prototype had
// no protection against at all.
export const checkoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many checkout attempts. Please wait a few minutes." } },
});

// Deliberately strict: admin login is a high-value target for brute-force.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many login attempts. Please wait 15 minutes." } },
});

// Webhooks/callbacks come from a small set of known gateways but can be
// retried aggressively on failure — allow more headroom than user-facing
// endpoints while still capping abuse.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
