import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Subscription, PaginationMeta, SubscriptionStatus } from "@/types/api";
import { StatusPill } from "@/components/StatusPill";
import { Pagination } from "@/components/Pagination";

const STATUSES: Array<SubscriptionStatus | "ALL"> = ["ALL", "ACTIVE", "PENDING", "EXPIRED", "CANCELLED"];

export function SubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | "ALL">("ACTIVE");
  const [page, setPage] = useState(1);
  const [renewals, setRenewals] = useState<Subscription[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status !== "ALL") params.set("status", status);
    api
      .get<Subscription[]>(`/admin/subscriptions?${params}`)
      .then(({ data, meta }) => {
        setItems(data);
        if (meta) setMeta(meta);
      })
      .catch(() => {});
  }, [status, page]);

  useEffect(() => {
    api
      .get<Subscription[]>("/admin/subscriptions/upcoming-renewals?withinDays=7")
      .then(({ data }) => setRenewals(data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Subscriptions</h2>
        <p className="text-muted text-sm mt-1">Every subscription, and what's coming up for renewal.</p>
      </div>

      {renewals.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-3">Renewing within 7 days</h3>
          <div className="space-y-2">
            {renewals.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-hairline pb-2 last:border-0">
                <div>
                  <p>{s.user?.telegramUsername ? `@${s.user.telegramUsername}` : s.userId}</p>
                  <p className="text-muted text-xs">{s.plan.name}</p>
                </div>
                <p className="mono-figure text-xs text-signal">
                  {s.endDate && new Date(s.endDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`btn-ghost text-xs ${status === s ? "bg-raised text-ink" : ""}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left">
            <tr className="text-muted text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">{s.user?.telegramUsername ? `@${s.user.telegramUsername}` : s.userId}</td>
                <td className="px-4 py-3">{s.plan.name}</td>
                <td className="px-4 py-3">
                  <StatusPill status={s.status} />
                </td>
                <td className="px-4 py-3 mono-figure text-xs text-muted">
                  {s.endDate ? new Date(s.endDate).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No subscriptions with this status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />}
    </div>
  );
}
