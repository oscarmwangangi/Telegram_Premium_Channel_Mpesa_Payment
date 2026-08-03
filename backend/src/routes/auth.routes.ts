import { Router } from "express";
import { validateBody } from "@/middleware/validate";
import { requireAdminAuth, requireRole } from "@/middleware/auth.middleware";
import { loginLimiter } from "@/middleware/rate-limiter";
import {
  loginSchema,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  createAdminSchema,
  createAdminHandler,
} from "@/controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validateBody(loginSchema), loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAdminAuth, meHandler);

// Only a SUPER_ADMIN can create other admin accounts.
authRouter.post(
  "/admins",
  requireAdminAuth,
  requireRole("SUPER_ADMIN"),
  validateBody(createAdminSchema),
  createAdminHandler
);
