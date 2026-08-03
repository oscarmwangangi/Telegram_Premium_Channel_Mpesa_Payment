import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { getDashboardStats } from "@/services/dashboard.service";

export const getDashboardStatsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await getDashboardStats();
  console.dir(stats, { depth: null });
  return ok(res, stats);
});
