import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  await prisma.subscriptionPlan.upsert({
    where: { code: "MONTHLY" },
    update: {},
    create: {
      code: "MONTHLY",
      name: "Monthly Plan",
      description: "30 days of access to the premium Telegram channel",
      priceUsd: 3,
      durationDays: 30,
      isActive: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { code: "YEARLY" },
    update: {},
    create: {
      code: "YEARLY",
      name: "Yearly Plan",
      description: "365 days of access to the premium Telegram channel",
      priceUsd: 13,
      durationDays: 365,
      isActive: true,
    },
  });

  console.log("Seeded subscription plans: MONTHLY ($3/30d), YEARLY ($13/365d)");

  // Bootstrap a SUPER_ADMIN only if explicitly provided via env — never
  // create one with a default/known password.
  const seedEmail = process.env.ADMIN_SEED_EMAIL;
  const seedPassword = process.env.ADMIN_SEED_PASSWORD;

  if (seedEmail && seedPassword) {
    const existing = await prisma.adminUser.findUnique({ where: { email: seedEmail.toLowerCase() } });
    if (!existing) {
      const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });
      await prisma.adminUser.create({
        data: {
          email: seedEmail.toLowerCase(),
          passwordHash,
          name: "Super Admin",
          role: "SUPER_ADMIN",
        },
      });
      console.log(`Seeded SUPER_ADMIN account: ${seedEmail}`);
    } else {
      console.log(`SUPER_ADMIN ${seedEmail} already exists — skipping`);
    }
  } else {
    console.log("ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set — skipping admin bootstrap");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
