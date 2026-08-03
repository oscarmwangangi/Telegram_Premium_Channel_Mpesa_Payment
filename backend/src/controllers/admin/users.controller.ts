import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { userRepository } from "@/repositories/user.repository";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { paymentRepository } from "@/repositories/payment.repository";
import { channelAccessRepository } from "@/repositories/channel-access.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { cancelSubscription, extendSubscription } from "@/services/subscription-lifecycle.service";
import { NotFoundError } from "@/lib/errors";

const idParamSchema = z.object({ id: z.string().uuid() });
const subscriptionIdParamSchema = z.object({ subscriptionId: z.string().uuid() });

const listQuerySchema = z.object({
  query: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const listUsersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { query, status, page, pageSize } = listQuerySchema.parse(req.query);
  const [items, totalItems] = await userRepository.search({ query, status, page, pageSize });
  return ok(res, items, {
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  });
});

export const getUserDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError("User not found");

  const [subscriptions, payments, channelAccess] = await Promise.all([
    subscriptionRepository.history(user.id),
    paymentRepository.listForUser(user.id),
    channelAccessRepository.findByUser(user.id),
  ]);

  return ok(res, { user, subscriptions, payments, channelAccess });
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]) });

export const updateUserStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { status } = statusSchema.parse(req.body);

  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError("User not found");

  const updated = await userRepository.setStatus(id, status);

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: status === "ACTIVE" ? "USER_REACTIVATED" : "USER_SUSPENDED",
    entityType: "User",
    entityId: id,
    metadata: { previousStatus: user.status, newStatus: status },
  });

  return ok(res, updated);
});

const extendSchema = z.object({ additionalDays: z.coerce.number().int().positive().max(3650) });

export const extendUserSubscriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { subscriptionId } = subscriptionIdParamSchema.parse(req.params);
  const { additionalDays } = extendSchema.parse(req.body);

  const updated = await extendSubscription(subscriptionId, additionalDays);

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "SUBSCRIPTION_EXTENDED",
    entityType: "Subscription",
    entityId: subscriptionId,
    metadata: { additionalDays },
  });

  return ok(res, updated);
});

export const cancelUserSubscriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { subscriptionId } = subscriptionIdParamSchema.parse(req.params);

  const updated = await cancelSubscription(subscriptionId);

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "SUBSCRIPTION_CANCELLED",
    entityType: "Subscription",
    entityId: subscriptionId,
  });

  return ok(res, updated);
});
