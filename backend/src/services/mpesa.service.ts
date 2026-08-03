import axios from "axios";
import { env, mpesaBaseUrl } from "@/config/env";
import { logger } from "@/lib/logger";
import { ExternalServiceError, ValidationError } from "@/lib/errors";
import { paymentRepository } from "@/repositories/payment.repository";
import { paymentTransactionRepository } from "@/repositories/payment-transaction.repository";
import { convertUsdToKes } from "@/services/exchange-rate.service";
import { activateSubscriptionForPayment } from "@/services/subscription-lifecycle.service";
import { sendPaymentFailedEmail } from "@/services/notification.service";
import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan, User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Access token — cached in-memory until expiry, instead of fetching on every
// single STK push like the original prototype did.
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString(
    "base64"
  );

  try {
    const { data } = await axios.get(
      `${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
    );

    // Daraja tokens are valid for 3600s; refresh a little early.
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
    };

    return cachedToken.token;
  } catch (err) {
    logger.error({ err }, "Failed to obtain M-Pesa access token");
    throw new ExternalServiceError("M-Pesa", "Could not authenticate with Daraja");
  }
}

function buildTimestamp(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

// ---------------------------------------------------------------------------
// STK Push initiation
// ---------------------------------------------------------------------------

export async function initiateStkPush(params: {
  user: User;
  plan: SubscriptionPlan;
  phoneNumber: string; // already normalized to 2547XXXXXXXX
}) {
  const { user, plan, phoneNumber } = params;

  const { amountKes, rate } = await convertUsdToKes(Number(plan.priceUsd));

  // Create the Payment record BEFORE calling Daraja, in PENDING state.
  // This guarantees every STK attempt is tracked even if the network call
  // to Safaricom fails outright, and gives us a payment.id to attach the
  // transaction to once we get a CheckoutRequestID back.
  const payment = await paymentRepository.create({
    userId: user.id,
    planId: plan.id,
    method: "MPESA",
    amount: amountKes,
    currency: "KES",
    amountUsd: Number(plan.priceUsd),
    exchangeRate: rate,
  });

  const token = await getAccessToken();
  const timestamp = buildTimestamp();
  const password = Buffer.from(
    `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const requestBody = {
    BusinessShortCode: env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amountKes,
    PartyA: phoneNumber,
    PartyB: env.MPESA_SHORTCODE,
    PhoneNumber: phoneNumber,
    CallBackURL: env.MPESA_CALLBACK_URL,
    AccountReference: `SUB-${plan.code}`,
    TransactionDesc: `${plan.name} channel access`,
  };

  try {
    const { data } = await axios.post(
      `${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`,
      requestBody,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );

    if (!data.CheckoutRequestID || !data.MerchantRequestID) {
      throw new Error(`Unexpected Daraja response shape: ${JSON.stringify(data)}`);
    }

    await paymentTransactionRepository.createMpesaAttempt({
      paymentId: payment.id,
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      rawRequestPayload: requestBody,
    });

    return { payment, checkoutRequestId: data.CheckoutRequestID as string };
  } catch (err) {
    await paymentRepository.markFailed(payment.id, "STK push request failed");
    logger.error({ err, paymentId: payment.id }, "M-Pesa STK push failed");
    throw new ExternalServiceError("M-Pesa", "Failed to initiate STK push");
  }
}

// ---------------------------------------------------------------------------
// Callback handling
// ---------------------------------------------------------------------------

interface DarajaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: Array<{ Name: string; Value: string | number }> };
    };
  };
}

function isValidDarajaCallback(body: unknown): body is DarajaCallbackBody {
  const b = body as DarajaCallbackBody;
  return Boolean(
    b?.Body?.stkCallback &&
      typeof b.Body.stkCallback.CheckoutRequestID === "string" &&
      typeof b.Body.stkCallback.ResultCode === "number"
  );
}

/**
 * Processes an M-Pesa callback. Fixes, relative to the original prototype:
 *  - Validates the payload shape before trusting anything in it.
 *  - Matches the callback to a payment via CheckoutRequestID (a unique,
 *    unguessable value Safaricom generated for THIS specific STK push) —
 *    never by phone number, which is ambiguous and spoofable.
 *  - Is idempotent: a retried callback (Safaricom retries on timeout) is a
 *    no-op the second time, enforced via paymentTransactionRepository.resolve.
 *  - Explicitly handles the failure/timeout path instead of silently
 *    dropping it.
 */
export async function handleMpesaCallback(rawBody: unknown) {
  if (!isValidDarajaCallback(rawBody)) {
    logger.warn({ rawBody }, "Rejected malformed M-Pesa callback");
    throw new ValidationError("Malformed M-Pesa callback payload");
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = rawBody.Body.stkCallback;

  const transaction = await paymentTransactionRepository.findByCheckoutRequestId(
    CheckoutRequestID
  );

  if (!transaction) {
    // Callback for a CheckoutRequestID we never initiated, or already purged.
    // Log and ack with 200 (Safaricom will keep retrying otherwise) but do nothing.
    logger.warn({ CheckoutRequestID }, "M-Pesa callback for unknown CheckoutRequestID");
    return { handled: false };
  }

  if (ResultCode === 0) {
    const items = CallbackMetadata?.Item ?? [];
    const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
      | string
      | undefined;

    const resolved = await paymentTransactionRepository.resolve(transaction.id, {
      status: "SUCCESS",
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      mpesaReceiptNumber: receipt ?? null,
      rawCallbackPayload: rawBody,
    });

    if (!resolved) {
      // Already processed by an earlier (duplicate/retried) callback.
      logger.info({ CheckoutRequestID }, "Duplicate M-Pesa success callback ignored");
      return { handled: false, duplicate: true };
    }

    const subscription = await activateSubscriptionForPayment(transaction.paymentId);
    return { handled: true, success: true, paymentId: transaction.paymentId, subscription };
  }

  // Failure / cancellation / timeout — must not be silently dropped.
  const resolved = await paymentTransactionRepository.resolve(transaction.id, {
    status: "FAILED",
    resultCode: ResultCode,
    resultDesc: ResultDesc,
    rawCallbackPayload: rawBody,
  });

  if (resolved) {
    await paymentRepository.markFailed(transaction.paymentId, ResultDesc);

    const paymentWithUser = await prisma.payment.findUnique({
      where: { id: transaction.paymentId },
      include: { user: true, plan: true },
    });
    if (paymentWithUser) {
      try {
        await sendPaymentFailedEmail(paymentWithUser.user, paymentWithUser, ResultDesc);
      } catch (err) {
        logger.error({ err, paymentId: transaction.paymentId }, "Failed to send payment-failed email");
      }
    }
  }

  return { handled: Boolean(resolved), success: false, paymentId: transaction.paymentId };
}
