import { cancelSubscription } from "@/services/subscription-lifecycle.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function cancelSubscriptionsJob(): Promise<number> {
  const now = new Date();

  // 1. Fetch all subscriptions marked CANCELLED/CANCELED whose paid period has ended
  const cancelledSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["CANCELLED"] },
      endDate: { lte: now },
    },
    select: { id: true },
  });

  let processedCount = 0;

  // 2. Process sequentially to prevent hitting Telegram API rate limits
  for (const sub of cancelledSubscriptions) {
    try {
      await cancelSubscription(sub.id);
      processedCount++;
    } catch (err) {
      logger.error(
        { err, subscriptionId: sub.id },
        "Failed to revoke Telegram access for cancelled subscription"
      );
    }
  }

  if (processedCount > 0) {
    logger.info({ processedCount }, "Cancelled subscriptions processing complete");
  }

  return processedCount;
}

export default cancelSubscriptionsJob;