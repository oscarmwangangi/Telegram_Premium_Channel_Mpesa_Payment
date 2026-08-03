import { userRepository } from "@/repositories/user.repository";
import { subscriptionPlanRepository } from "@/repositories/subscription-plan.repository";
import { assertCanStartCheckout } from "@/services/subscription-status.service";
import { initiateStkPush } from "@/services/mpesa.service";
import { createPaypalOrder } from "@/services/paypal.service";
import { normalizePhoneNumber } from "@/utils/phone";
import { NotFoundError, ValidationError } from "@/lib/errors";

export type CheckoutMethod = "MPESA" | "PAYPAL";

/**
 * The single entrypoint for starting a checkout, whichever surface calls
 * it (Telegram bot, public API, future web frontend). Always re-checks
 * subscription status first — see subscription-status.service — so this
 * function is the enforcement point for "never ask a user to pay again
 * while they have an active subscription" from section 6 of the spec.
 */
export async function startCheckout(params: {
  telegramId: bigint;
  planCode: string;
  method: CheckoutMethod;
  phoneNumber?: string; // required for MPESA
}) {
  const { telegramId, planCode, method, phoneNumber } = params;

  const user = await userRepository.findByTelegramId(telegramId);
  if (!user) throw new NotFoundError("User not found. Send /start to the bot first.");

  const plan = await subscriptionPlanRepository.findByCode(planCode);
  if (!plan || !plan.isActive) throw new NotFoundError("Subscription plan not found or inactive");

  await assertCanStartCheckout(user.id);

  if (method === "MPESA") {
    if (!phoneNumber) throw new ValidationError("Phone number is required for M-Pesa checkout");
    const normalized = normalizePhoneNumber(phoneNumber);
    if (normalized !== user.phoneNumber) {
      await userRepository.updatePhoneNumber(user.id, normalized);
    }
    return initiateStkPush({ user, plan, phoneNumber: normalized });
  }

  if (method === "PAYPAL") {
    return createPaypalOrder({ user, plan });
  }

  throw new ValidationError(`Unsupported payment method: ${method}`);
}
