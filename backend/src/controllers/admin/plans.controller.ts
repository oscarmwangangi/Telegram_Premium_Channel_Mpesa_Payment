import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok, created } from "@/lib/http-response";
import { subscriptionPlanRepository } from "@/repositories/subscription-plan.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { NotFoundError } from "@/lib/errors";

const idParamSchema = z.object({ id: z.string().uuid() });

export const listPlansHandler = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await subscriptionPlanRepository.listAll();
  return ok(res, plans);
});

const createPlanSchema = z.object({
  code: z.string().min(1).max(30).toUpperCase(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceUsd: z.coerce.number().positive(),
  durationDays: z.coerce.number().int().positive(),
});

export const createPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createPlanSchema.parse(req.body);
  const plan = await subscriptionPlanRepository.create(body);

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "PLAN_CREATED",
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    metadata: body,
  });

  return created(res, plan);
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  priceUsd: z.coerce.number().positive().optional(),
  durationDays: z.coerce.number().int().positive().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const updatePlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updatePlanSchema.parse(req.body);

  const existing = await subscriptionPlanRepository.findById(id);
  if (!existing) throw new NotFoundError("Plan not found");

  const updated = await subscriptionPlanRepository.update(id, body);

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "PLAN_UPDATED",
    entityType: "SubscriptionPlan",
    entityId: id,
    metadata: body,
  });

  return ok(res, updated);
});

// "Disable" a plan without deleting it — existing subscriptions on a
// disabled plan are untouched; it just stops appearing in the bot's
// plan-selection menu (see subscriptionPlanRepository.listActive, used by
// bot.ts) and can no longer be checked out against.
export const disablePlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const existing = await subscriptionPlanRepository.findById(id);
  if (!existing) throw new NotFoundError("Plan not found");

  const updated = await subscriptionPlanRepository.update(id, { isActive: false });

  await auditLogRepository.record({
    actorType: "ADMIN",
    adminUserId: req.admin!.id,
    action: "PLAN_DISABLED",
    entityType: "SubscriptionPlan",
    entityId: id,
  });

  return ok(res, updated);
});
