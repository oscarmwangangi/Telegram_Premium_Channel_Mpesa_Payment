import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DashboardStats } from "@/types/api";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardStats>("/admin/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => setError("Couldn't load dashboard stats."));
  }, []);

  if (error) return <p className="text-danger">{error}</p>;
  if (!stats) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-muted text-sm mt-1">Subscriber and revenue signal, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active subscribers" value={stats.subscriptions.active} />
        <StatCard label="Expired" value={stats.subscriptions.expired} />
        <StatCard
          label="Plan split"
          value={`${stats.subscriptions.monthly} / ${stats.subscriptions.yearly}`}
          sublabel="Monthly / Yearly"
        />
        <StatCard label="Total users" value={stats.users.total} sublabel={`+${stats.users.newToday} today`} />
        <StatCard label="Revenue today" value={usd(stats.revenue.todayUsd)} />
        <StatCard label="Revenue this month" value={usd(stats.revenue.thisMonthUsd)} sublabel={`${stats.revenue.paymentsThisMonth} payments`} />
        <StatCard label="Revenue this year" value={usd(stats.revenue.thisYearUsd)} />
        <StatCard
          label="Telegram membership"
          value={stats.telegram.joined}
          sublabel={`${stats.telegram.invitedNotYetJoined} invited, not yet joined`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-3">Recent payments</h3>
          <div className="space-y-2">
            {stats.payments.recent.length === 0 && <p className="text-muted text-sm">None yet.</p>}
            {stats.payments.recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-hairline last:border-0">
                <div>
                  <p className="text-ink">{p.plan.name}</p>
                  <p className="text-muted text-xs">{p.method}</p>
                </div>
                <div className="text-right">
                  <p className="mono-figure">${Number(p.amountUsd).toFixed(2)}</p>
                  <StatusPill status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-medium mb-3">Recently failed payments</h3>
          <div className="space-y-2">
            {stats.payments.recentlyFailed.length === 0 && (
              <p className="text-muted text-sm">Nothing failed in the last week.</p>
            )}
            {stats.payments.recentlyFailed.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-hairline last:border-0">
                <div>
                  <p className="text-ink">{p.plan.name}</p>
                  <p className="text-muted text-xs">{p.failureReason ?? p.method}</p>
                </div>
                <p className="mono-figure text-danger">${Number(p.amountUsd).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
