import { Router } from "express";
import { validateBody } from "@/middleware/validate";
import { checkoutLimiter, webhookLimiter } from "@/middleware/rate-limiter";
import {
  checkoutSchema,
  startCheckoutHandler,
  mpesaCallbackHandler,
  paypalCaptureSchema,
  paypalCaptureHandler,
  paypalWebhookHandler,
} from "@/controllers/payment.controller";

export const paymentRouter = Router();

paymentRouter.post("/checkout", checkoutLimiter, validateBody(checkoutSchema), startCheckoutHandler);
paymentRouter.post("/mpesa/callback", webhookLimiter, mpesaCallbackHandler);
paymentRouter.post("/paypal/capture", validateBody(paypalCaptureSchema), paypalCaptureHandler);
paymentRouter.post("/paypal/webhook", webhookLimiter, paypalWebhookHandler);
