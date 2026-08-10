import { cancelSubscriptionsJob } from "../src/jobs/cancel-subscriptions.job";
import { logger } from "../src/lib/logger";

async function runTest() {
  logger.info("Starting manual test run of cancelSubscriptionsJob...");
  
  const processed = await cancelSubscriptionsJob();
  
  logger.info({ processed }, "Test execution complete!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});