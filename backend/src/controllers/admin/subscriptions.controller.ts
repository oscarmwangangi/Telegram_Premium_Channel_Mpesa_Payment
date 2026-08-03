import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { subscriptionRepository } from "@/repositories/subscription.repository";

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const listSubscriptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { status, page, pageSize } = listQuerySchema.parse(req.query);
  const [items, totalItems] = await subscriptionRepository.list({ status, page, pageSize });
  return ok(res, items, { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) });
});

const expiringQuerySchema = z.object({
  withinDays: z.coerce.number().int().positive().max(90).default(7),
});

// "Upcoming renewals" view — subscriptions expiring within the given window.
export const listUpcomingRenewalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { withinDays } = expiringQuerySchema.parse(req.query);
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 86400000);
  const items = await subscriptionRepository.findExpiringBetween(now, until);
  return ok(res, items);
});
