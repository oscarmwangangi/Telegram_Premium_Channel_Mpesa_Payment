import { useEffect, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import type { Payment, PaginationMeta, PaymentStatus, PaymentMethod } from "@/types/api";
import { StatusPill } from "@/components/StatusPill";
import { Pagination } from "@/components/Pagination";

const STATUSES: Array<PaymentStatus | "ALL"> = ["ALL", "SUCCESS", "PENDING", "FAILED", "TIMEOUT", "CANCELLED"];
const METHODS: Array<PaymentMethod | "ALL"> = ["ALL", "MPESA", "PAYPAL"];

export function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [status, setStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [method, setMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  function buildParams(withPagination: boolean) {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (method !== "ALL") params.set("method", method);
    if (withPagination) {
      params.set("page", String(page));
      params.set("pageSize", "20");
    }
    return params;
  }

  useEffect(() => {
    api
      .get<Payment[]>(`/admin/payments?${buildParams(true)}`)
      .then(({ data, meta }) => {
        setItems(data);
        if (meta) setMeta(meta);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, method, page]);

  async function retry(paymentId: string) {
    try {
      const { data } = await api.post<{ message: string }>(`/admin/payments/${paymentId}/retry`);
      setRetryMessage(data.message);
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : "Could not retry payment.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Payments</h2>
          <p className="text-muted text-sm mt-1">M-Pesa and PayPal transactions.</p>
        </div>
        <button
          className="btn-ghost text-xs"
          onClick={() => downloadFile(`/admin/payments/export?${buildParams(false)}`, "payments-export.csv")}
        >
          Export CSV
        </button>
      </div>

      <div className="flex gap-4">
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
        <div className="flex gap-2 border-l border-hairline pl-4">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMethod(m);
                setPage(1);
              }}
              className={`btn-ghost text-xs ${method === m ? "bg-raised text-ink" : ""}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {retryMessage && (
        <div className="card p-3 text-sm text-signal border-signal/30">{retryMessage}</div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left">
            <tr className="text-muted text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">{p.plan.name}</td>
                <td className="px-4 py-3 text-muted">{p.method}</td>
                <td className="px-4 py-3 mono-figure">
                  {p.amount} {p.currency}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-3 mono-figure text-xs text-muted">
                  {new Date(p.initiatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === "FAILED" && (
                    <button onClick={() => retry(p.id)} className="btn-ghost text-xs">
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No payments match these filters.
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
