import { PrismaClient } from "@prisma/client";
import { isProduction } from "@/config/env";

// Reuse a single PrismaClient instance across the app (and across hot
// reloads in dev) to avoid exhausting the DB connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["error", "warn", "query"],
  });

if (!isProduction) {
  global.__prisma__ = prisma;
}
