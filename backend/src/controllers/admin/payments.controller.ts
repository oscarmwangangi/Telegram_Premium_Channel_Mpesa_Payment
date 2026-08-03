import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/async-handler";
import { ok } from "@/lib/http-response";
import { paymentRepository } from "@/repositories/payment.repository";
import { NotFoundError, ValidationError } from "@/lib/errors";

const listQuerySchema = z.object({
  method: z.enum(["MPESA", "PAYPAL"]).optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const listPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { method, status, page, pageSize } = listQuerySchema.parse(req.query);
  const [items, totalItems] = await paymentRepository.list({ method, status, page, pageSize });
  return ok(res, items, { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) });
});

function toCsvRow(fields: Array<string | number>): string {
  return fields
    .map((f) => {
      const s = String(f);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

// Exports the currently-filtered payment set as CSV. Capped at 5,000 rows
// per export to keep this a synchronous request/response rather than
// needing a background job + download-link flow.
export const exportPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { method, status } = listQuerySchema.omit({ page: true, pageSize: true }).parse(req.query);
  const [items] = await paymentRepository.list({ method, status, page: 1, pageSize: 5000 });

  const header = toCsvRow([
    "id",
    "userId",
    "phoneOrEmail",
    "plan",
    "method",
    "amount",
    "currency",
    "amountUsd",
    "status",
    "initiatedAt",
    "completedAt",
  ]);

  const rows = items.map((p: (typeof items)[number]) =>
    toCsvRow([
      p.id,
      p.userId,
      p.user.phoneNumber ?? p.user.email ?? "",
      p.plan.name,
      p.method,
      Number(p.amount),
      p.currency,
      Number(p.amountUsd),
      p.status,
      p.initiatedAt.toISOString(),
      p.completedAt?.toISOString() ?? "",
    ])
  );

  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="payments-export-${Date.now()}.csv"`);
  return res.send(csv);
});

const retrySchema = z.object({ paymentId: z.string().uuid() });

// "Retry failed payments where applicable" (spec section 9): for M-Pesa this
// means re-initiating a fresh STK push against the same plan/user, since a
// failed STK push cannot itself be resubmitted. For PayPal, a fresh order
// must be created the same way. This endpoint returns guidance rather than
// silently faking a retry, since the actual retry has to go back through
// the normal checkout flow (which also re-validates "does this user still
// need to pay" via assertCanStartCheckout).
export const retryFailedPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { paymentId } = retrySchema.parse(req.params);
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) throw new NotFoundError("Payment not found");
  if (payment.status !== "FAILED") {
    throw new ValidationError("Only FAILED payments can be retried");
  }

  return ok(res, {
    message:
      "M-Pesa/PayPal payments cannot be resubmitted directly. Ask the user to restart checkout via /start, or use the checkout API with the same plan.",
    userId: payment.userId,
    planId: payment.planId,
    method: payment.method,
  });
});
