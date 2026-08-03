export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export type SubscriptionStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type PaymentMethod = "MPESA" | "PAYPAL";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceUsd: string;
  durationDays: number;
  isActive: boolean;
}

export interface AppUser {
  id: string;
  telegramId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  email: string | null;
  status: UserStatus;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean;
  createdAt: string;
  plan: Plan;
  user?: AppUser;
}

export interface Payment {
  id: string;
  userId: string;
  planId: string;
  method: PaymentMethod;
  amount: string;
  currency: "KES" | "USD";
  amountUsd: string;
  status: PaymentStatus;
  initiatedAt: string;
  completedAt: string | null;
  failureReason: string | null;
  plan: Plan;
  user?: AppUser;
}

export interface DashboardStats {
  users: { total: number; newToday: number; newThisMonth: number };
  subscriptions: { active: number; expired: number; monthly: number; yearly: number };
  revenue: { todayUsd: number; thisMonthUsd: number; thisYearUsd: number; paymentsThisMonth: number };
  payments: { recent: Payment[]; recentlyFailed: Payment[] };
  telegram: { joined: number; invitedNotYetJoined: number };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
