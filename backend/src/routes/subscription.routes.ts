import { Router } from "express";
import { getStatusHandler, listPlansHandler } from "@/controllers/subscription.controller";

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", listPlansHandler);
subscriptionRouter.get("/status/:telegramId", getStatusHandler);
