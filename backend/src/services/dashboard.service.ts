import { prisma } from "@/lib/prisma";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { paymentRepository } from "@/repositories/payment.repository";

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfYear(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * Single aggregate query set for the admin dashboard overview. Everything
 * runs in parallel via Promise.all rather than sequentially — this endpoint
 * is read many times a day by admins and shouldn't be a chain of a dozen
 * round trips.
 */
export async function getDashboardStats() {
  const now = new Date();

  const [
    totalUsers,
    activeSubscribers,
    expiredSubscribers,
    monthlySubs,
    yearlySubs,
    newUsersToday,
    newUsersThisMonth,
    revenueToday,
    revenueThisMonth,
    revenueThisYear,
    recentPayments,
    failedPaymentsRecent,
    telegramJoined,
    telegramInvitedNotJoined,
  ] = await Promise.all([
    prisma.user.count(),
    subscriptionRepository.countByStatus("ACTIVE"),
    subscriptionRepository.countByStatus("EXPIRED"),
    subscriptionRepository.countByPlanCode("MONTHLY"),
    subscriptionRepository.countByPlanCode("YEARLY"),
    prisma.user.count({ where: { createdAt: { gte: startOfDay(now) } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth(now) } } }),
    paymentRepository.revenueBetween(startOfDay(now), now),
    paymentRepository.revenueBetween(startOfMonth(now), now),
    paymentRepository.revenueBetween(startOfYear(now), now),
    prisma.payment.findMany({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      take: 10,
      include: { user: true, plan: true },
    }),
    prisma.payment.findMany({
      where: { status: "FAILED", updatedAt: { gte: startOfDay(new Date(now.getTime() - 7 * 86400000)) } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { user: true, plan: true },
    }),
    prisma.telegramChannelAccess.count({ where: { status: "JOINED" } }),
    prisma.telegramChannelAccess.count({ where: { status: "INVITED" } }),
  ]);
console.dir(recentPayments, { depth: null });
  return {
    users: {
      total: totalUsers,
      newToday: newUsersToday,
      newThisMonth: newUsersThisMonth,
    },
    subscriptions: {
      active: activeSubscribers,
      expired: expiredSubscribers,
      monthly: monthlySubs,
      yearly: yearlySubs,
    },
    revenue: {
      todayUsd: Number(revenueToday._sum.amountUsd ?? 0),
      thisMonthUsd: Number(revenueThisMonth._sum.amountUsd ?? 0),
      thisYearUsd: Number(revenueThisYear._sum.amountUsd ?? 0),
      paymentsThisMonth: revenueThisMonth._count,
    },
    payments: {
      recent: recentPayments,
      recentlyFailed: failedPaymentsRecent,
    },
    telegram: {
      joined: telegramJoined,
      invitedNotYetJoined: telegramInvitedNotJoined,
    },
  };
}
