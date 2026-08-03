import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { getSubscriptionStatus } from "@/services/subscription-status.service";
import { userRepository } from "@/repositories/user.repository";
import { subscriptionPlanRepository } from "@/repositories/subscription-plan.repository";
import { NotFoundError } from "@/lib/errors";

const paramsSchema = z.object({ telegramId: z.coerce.bigint() });

export const getStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId } = paramsSchema.parse(req.params);

  const user = await userRepository.findByTelegramId(telegramId);
  if (!user) throw new NotFoundError("User not found");

  const status = await getSubscriptionStatus(user.id);
  return ok(res, status);
});

export const listPlansHandler = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await subscriptionPlanRepository.listActive();
  return ok(res, plans);
});
