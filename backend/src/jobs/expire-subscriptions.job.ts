import { expirePastDueSubscriptions } from "@/services/subscription-lifecycle.service";
import { logger } from "@/lib/logger";

export async function runExpirySweep(): Promise<number> {
  const count = await expirePastDueSubscriptions();
  if (count > 0) {
    logger.info({ count }, "Expiry sweep: subscriptions expired, Telegram access revoked, emails sent");
  }
  return count;
}
