import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok, created } from "@/lib/http-response";
import { startCheckout } from "@/services/payment.service";
import { handleMpesaCallback } from "@/services/mpesa.service";
import { capturePaypalOrder, verifyPaypalWebhookSignature } from "@/services/paypal.service";
import { activateSubscriptionForPayment } from "@/services/subscription-lifecycle.service";
import { paymentTransactionRepository } from "@/repositories/payment-transaction.repository";
import { logger } from "@/lib/logger";

export const checkoutSchema = z.object({
  telegramId: z.coerce.bigint(),
  planCode: z.enum(["MONTHLY", "YEARLY"]),
  method: z.enum(["MPESA", "PAYPAL"]),
  phoneNumber: z.string().optional(),
});

export const startCheckoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId, planCode, method, phoneNumber } = req.body as z.infer<typeof checkoutSchema>;
  const result = await startCheckout({ telegramId, planCode, method, phoneNumber });
  return created(res, result);
});

// M-Pesa callback: intentionally unauthenticated (Daraja calls it directly),
// but validated at the service layer and matched by CheckoutRequestID, not
// by trusting the payload's claimed identity — see mpesa.service.ts.
export const mpesaCallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    await handleMpesaCallback(req.body);
  } catch (err) {
    // Always ACK 200 to Safaricom even on our internal validation errors —
    // returning non-200 causes Safaricom to retry indefinitely, and a
    // malformed/duplicate callback is not something retrying will fix.
    logger.error({ err }, "Error while processing M-Pesa callback");
  }
  return res.sendStatus(200);
});

export const paypalCaptureSchema = z.object({ orderId: z.string().min(1) });

export const paypalCaptureHandler = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.body as z.infer<typeof paypalCaptureSchema>;
  const result = await capturePaypalOrder(orderId);
  return ok(res, result);
});

export const paypalWebhookHandler = asyncHandler(async (req: Request, res: Response) => {
  const isValid = await verifyPaypalWebhookSignature({
    headers: req.headers as Record<string, string>,
    body: req.body,
  });

  if (!isValid) {
    logger.warn("Rejected PayPal webhook with invalid signature");
    return res.sendStatus(400);
  }

  const eventType = req.body?.event_type;
  const orderId = req.body?.resource?.id ?? req.body?.resource?.supplementary_data?.related_ids?.order_id;

  if (eventType === "CHECKOUT.ORDER.APPROVED" || eventType === "PAYMENT.CAPTURE.COMPLETED") {
    if (orderId) {
      const transaction = await paymentTransactionRepository.findByPaypalOrderId(orderId);
      if (transaction) {
        const resolved = await paymentTransactionRepository.resolve(transaction.id, {
          status: "SUCCESS",
          resultDesc: eventType,
          rawCallbackPayload: req.body,
        });
        if (resolved) {
          await activateSubscriptionForPayment(transaction.paymentId);
        }
      }
    }
  }

  return res.sendStatus(200);
});

// export async function handlePaypalReturnHandler(req: Request, res: Response) {
//   const { token, PayerID } = req.query;

//   try {
   
//     res.redirect(`${process.env.FRONTEND_URL}/payment-success?orderId=${token}`);
//   } catch (error) {
//     res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
//   }
// }