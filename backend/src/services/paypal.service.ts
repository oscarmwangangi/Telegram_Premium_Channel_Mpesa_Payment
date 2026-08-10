import axios from "axios";
import { env, paypalBaseUrl } from "@/config/env";
import { logger } from "@/lib/logger";
import { ExternalServiceError, ValidationError } from "@/lib/errors";
import { paymentRepository } from "@/repositories/payment.repository";
import { paymentTransactionRepository } from "@/repositories/payment-transaction.repository";
import { activateSubscriptionForPayment } from "@/services/subscription-lifecycle.service";
import { sendPaymentFailedEmail } from "@/services/notification.service";
import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan, User } from "@prisma/client";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString(
    "base64"
  );

  try {
    const { data } = await axios.post(
      `${paypalBaseUrl}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      }
    );

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    logger.error({ err }, "Failed to obtain PayPal access token");
    throw new ExternalServiceError("PayPal", "Could not authenticate with PayPal");
  }
}

// ---------------------------------------------------------------------------
// Order creation (PayPal charges in USD directly — no conversion needed,
// unlike M-Pesa which requires KES)
// ---------------------------------------------------------------------------

export async function createPaypalOrder(params: { user: User; plan: SubscriptionPlan }) {
  const { user, plan } = params;
  const token = await getAccessToken();

  const payment = await paymentRepository.create({
    userId: user.id,
    planId: plan.id,
    method: "PAYPAL",
    amount: Number(plan.priceUsd),
    currency: "USD",
    amountUsd: Number(plan.priceUsd),
    exchangeRate: null,
  });

  try {
    const { data } = await axios.post(
      `${paypalBaseUrl}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: payment.id,
            description: `${plan.name} — premium channel access`,
            amount: { currency_code: "USD", value: Number(plan.priceUsd).toFixed(2) },
          },
        ],
        application_context: {
          brand_name: env.CHANNEL_NAME,
          user_action: "PAY_NOW",
          return_url: `${env.APP_BASE_URL}/api/payments/paypal/return`,
          cancel_url: `${env.APP_BASE_URL}/api/payments/paypal/cancel`,
        },
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );

    await paymentTransactionRepository.createPaypalAttempt({
      paymentId: payment.id,
      paypalOrderId: data.id,
      rawRequestPayload: data,
    });

    const approveLink = (data.links as Array<{ rel: string; href: string }>).find(
      (l) => l.rel === "approve"
    )?.href;

    return { payment, orderId: data.id as string, approveUrl: approveLink };
  } catch (err) {
    await paymentRepository.markFailed(payment.id, "PayPal order creation failed");
    logger.error({ err, paymentId: payment.id }, "PayPal order creation failed");
    throw new ExternalServiceError("PayPal", "Failed to create order");
  }
}

// ---------------------------------------------------------------------------
// Capture — called after the user approves on PayPal's site
// ---------------------------------------------------------------------------

export async function capturePaypalOrder(orderId: string) {
  const transaction = await paymentTransactionRepository.findByPaypalOrderId(orderId);
  if (!transaction) {
    throw new ValidationError("Unknown PayPal order");
  }

  const token = await getAccessToken();

  const { data } = await axios.post(
    `${paypalBaseUrl}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );

  const captureStatus = data.status; // "COMPLETED" | "DECLINED" | ...
  const payerId = data.payer?.payer_id ?? null;

  if (captureStatus !== "COMPLETED") {
    const resolved = await paymentTransactionRepository.resolve(transaction.id, {
      status: "FAILED",
      resultDesc: captureStatus,
      paypalPayerId: payerId,
      rawCallbackPayload: data,
    });
    if (resolved) {
      await paymentRepository.markFailed(transaction.paymentId, `PayPal status: ${captureStatus}`);

      const paymentWithUser = await prisma.payment.findUnique({
        where: { id: transaction.paymentId },
        include: { user: true, plan: true },
      });
      if (paymentWithUser) {
        try {
          await sendPaymentFailedEmail(paymentWithUser.user, paymentWithUser, `PayPal status: ${captureStatus}`);
        } catch (err) {
          logger.error({ err, paymentId: transaction.paymentId }, "Failed to send payment-failed email");
        }
      }
    }
    return { success: false, status: captureStatus };
  }

  const resolved = await paymentTransactionRepository.resolve(transaction.id, {
    status: "SUCCESS",
    resultDesc: captureStatus,
    paypalPayerId: payerId,
    rawCallbackPayload: data,
  });

  if (!resolved) {
    // Already captured via the async webhook — treat as success, no-op.
    return { success: true, duplicate: true };
  }

  const subscription = await activateSubscriptionForPayment(transaction.paymentId);
  return { success: true, paymentId: transaction.paymentId, subscription };
}

// ---------------------------------------------------------------------------
// Webhook signature verification — PayPal webhooks are the source of truth
// for payment completion in production (capture responses can be missed if
// the user closes the tab); verifying the signature stops anyone from
// POSTing a fake "COMPLETED" event straight to our webhook endpoint.
// ---------------------------------------------------------------------------

export async function verifyPaypalWebhookSignature(params: {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<boolean> {
  const token = await getAccessToken();

  try {
    const { data } = await axios.post(
      `${paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: params.headers["paypal-auth-algo"],
        cert_url: params.headers["paypal-cert-url"],
        transmission_id: params.headers["paypal-transmission-id"],
        transmission_sig: params.headers["paypal-transmission-sig"],
        transmission_time: params.headers["paypal-transmission-time"],
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: params.body,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );

    return data.verification_status === "SUCCESS";
  } catch (err) {
    logger.error({ err }, "PayPal webhook signature verification failed");
    return false;
  }
}

