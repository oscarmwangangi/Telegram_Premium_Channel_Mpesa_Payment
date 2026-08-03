import { prisma } from "@/lib/prisma";
import type { Prisma, TransactionStatus } from "@prisma/client";

export const paymentTransactionRepository = {
  createMpesaAttempt(
    params: {
      paymentId: string;
      merchantRequestId: string;
      checkoutRequestId: string;
      rawRequestPayload: unknown;
    },
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.paymentTransaction.create({
      data: {
        paymentId: params.paymentId,
        provider: "MPESA",
        merchantRequestId: params.merchantRequestId,
        checkoutRequestId: params.checkoutRequestId,
        rawRequestPayload: params.rawRequestPayload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
  },

  createPaypalAttempt(
    params: { paymentId: string; paypalOrderId: string; rawRequestPayload: unknown },
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.paymentTransaction.create({
      data: {
        paymentId: params.paymentId,
        provider: "PAYPAL",
        paypalOrderId: params.paypalOrderId,
        rawRequestPayload: params.rawRequestPayload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
  },

  findByCheckoutRequestId(checkoutRequestId: string) {
    return prisma.paymentTransaction.findUnique({
      where: { checkoutRequestId },
      include: { payment: true },
    });
  },

  findByPaypalOrderId(paypalOrderId: string) {
    return prisma.paymentTransaction.findUnique({
      where: { paypalOrderId },
      include: { payment: true },
    });
  },

  findByMpesaReceipt(mpesaReceiptNumber: string) {
    return prisma.paymentTransaction.findUnique({ where: { mpesaReceiptNumber } });
  },

  /**
   * Records the outcome of a gateway callback. Returns null (instead of
   * throwing) if the transaction was already resolved — this is the
   * idempotency guard against duplicate/retried callbacks.
   */
  async resolve(
    id: string,
    params: {
      status: TransactionStatus;
      resultCode?: number | null;
      resultDesc?: string | null;
      mpesaReceiptNumber?: string | null;
      paypalPayerId?: string | null;
      rawCallbackPayload: unknown;
    },
    tx: Prisma.TransactionClient = prisma
  ) {
    const existing = await tx.paymentTransaction.findUnique({ where: { id } });
    if (!existing || existing.status !== "PENDING") {
      return null; // already processed — no-op
    }

    return tx.paymentTransaction.update({
      where: { id },
      data: {
        status: params.status,
        resultCode: params.resultCode,
        resultDesc: params.resultDesc,
        mpesaReceiptNumber: params.mpesaReceiptNumber,
        paypalPayerId: params.paypalPayerId,
        rawCallbackPayload: params.rawCallbackPayload as Prisma.InputJsonValue,
      },
    });
  },
};
