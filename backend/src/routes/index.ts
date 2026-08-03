import { Router } from "express";
import { paymentRouter } from "@/routes/payment.routes";
import { subscriptionRouter } from "@/routes/subscription.routes";
import { authRouter } from "@/routes/auth.routes";
import { notificationRouter } from "@/routes/notification.routes";
import { adminDashboardRouter } from "@/routes/admin/dashboard.routes";
import { adminUserRouter } from "@/routes/admin/users.routes";
import { adminSubscriptionRouter } from "@/routes/admin/subscriptions.routes";
import { adminPaymentRouter } from "@/routes/admin/payments.routes";
import { adminPlanRouter } from "@/routes/admin/plans.routes";

export const apiRouter = Router();

apiRouter.use("/payments", paymentRouter);
apiRouter.use("/subscriptions", subscriptionRouter);
apiRouter.use("/admin/auth", authRouter);
apiRouter.use("/admin/notifications", notificationRouter);
apiRouter.use("/admin/dashboard", adminDashboardRouter);
apiRouter.use("/admin/users", adminUserRouter);
apiRouter.use("/admin/subscriptions", adminSubscriptionRouter);
apiRouter.use("/admin/payments", adminPaymentRouter);
apiRouter.use("/admin/plans", adminPlanRouter);

apiRouter.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));
