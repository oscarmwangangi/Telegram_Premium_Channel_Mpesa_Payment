import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppUser, PaginationMeta, Subscription, Payment } from "@/types/api";
import { StatusPill } from "@/components/StatusPill";
import { Pagination } from "@/components/Pagination";

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query) params.set("query", query);
    api
      .get<AppUser[]>(`/admin/users?${params}`)
      .then(({ data, meta }) => {
        setUsers(data);
        if (meta) setMeta(meta);
      })
      .catch(() => {});
  }

  useEffect(load, [page, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Users</h2>
          <p className="text-muted text-sm mt-1">Search by phone, email, or Telegram handle.</p>
        </div>
        <input
          className="input w-64"
          placeholder="Search users…"
          value={query}
          onChange={(e) => {
            setPage(1);
            setQuery(e.target.value);
          }}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline text-left">
            <tr className="text-muted text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Telegram</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className="border-b border-hairline last:border-0 hover:bg-raised/60 cursor-pointer"
              >
                <td className="px-4 py-3">
                  <p>{u.telegramUsername ? `@${u.telegramUsername}` : u.firstName ?? "—"}</p>
                  <p className="text-muted text-xs mono-figure">{u.telegramId}</p>
                </td>
                <td className="px-4 py-3 mono-figure text-xs">{u.phoneNumber ?? u.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusPill status={u.status} />
                </td>
                <td className="px-4 py-3 text-muted mono-figure text-xs">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No users match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />}

      {selectedId && (
        <UserDetailPanel userId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

function UserDetailPanel({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<{
    user: AppUser;
    subscriptions: Subscription[];
    payments: Payment[];
  } | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<typeof detail>(`/admin/users/${userId}`)
      .then(({ data }) => setDetail(data))
      .catch(() => {});
  }, [userId]);

  async function toggleStatus() {
    if (!detail) return;
    setBusy(true);
    const next = detail.user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api.patch(`/admin/users/${userId}/status`, { status: next });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function extendActive() {
    const active = detail?.subscriptions.find((s) => s.status === "ACTIVE");
    if (!active) return;
    setBusy(true);
    try {
      await api.patch(`/admin/users/subscriptions/${active.id}/extend`, {
        additionalDays: Number(extendDays),
      });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function cancelActive() {
    const active = detail?.subscriptions.find((s) => s.status === "ACTIVE");
    if (!active) return;
    setBusy(true);
    try {
      await api.patch(`/admin/users/subscriptions/${active.id}/cancel`);
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-end z-50" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border-l border-hairline h-full overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {!detail ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {detail.user.telegramUsername ? `@${detail.user.telegramUsername}` : "User"}
                </h3>
                <p className="text-muted text-xs mono-figure mt-0.5">{detail.user.telegramId}</p>
              </div>
              <button onClick={onClose} className="text-muted hover:text-ink text-sm">
                Close
              </button>
            </div>

            <div className="flex items-center gap-3">
              <StatusPill status={detail.user.status} />
              <button onClick={toggleStatus} disabled={busy} className="btn-ghost text-xs ml-auto">
                {detail.user.status === "ACTIVE" ? "Suspend" : "Reactivate"}
              </button>
            </div>

            <div className="text-sm space-y-1">
              <p className="text-muted text-xs">Contact</p>
              <p>{detail.user.phoneNumber ?? "No phone on file"}</p>
              <p>{detail.user.email ?? "No email on file"}</p>
            </div>

            <div>
              <p className="label-eyebrow mb-2">Subscriptions</p>
              <div className="space-y-2">
                {detail.subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm border-b border-hairline pb-2">
                    <div>
                      <p>{s.plan.name}</p>
                      <p className="text-muted text-xs">
                        {s.endDate ? `until ${new Date(s.endDate).toLocaleDateString()}` : "not activated"}
                      </p>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                ))}
                {detail.subscriptions.length === 0 && (
                  <p className="text-muted text-sm">No subscriptions yet.</p>
                )}
              </div>
            </div>

            {detail.subscriptions.some((s) => s.status === "ACTIVE") && (
              <div className="card p-4 space-y-3">
                <p className="label-eyebrow">Manage active subscription</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min={1}
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                  />
                  <button onClick={extendActive} disabled={busy} className="btn-primary text-xs">
                    Extend (days)
                  </button>
                </div>
                <button onClick={cancelActive} disabled={busy} className="btn-danger w-full text-xs">
                  Cancel subscription
                </button>
              </div>
            )}

            <div>
              <p className="label-eyebrow mb-2">Payment history</p>
              <div className="space-y-2">
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b border-hairline pb-2">
                    <div>
                      <p>{p.plan.name}</p>
                      <p className="text-muted text-xs">{p.method}</p>
                    </div>
                    <div className="text-right">
                      <p className="mono-figure">${Number(p.amountUsd).toFixed(2)}</p>
                      <StatusPill status={p.status} />
                    </div>
                  </div>
                ))}
                {detail.payments.length === 0 && <p className="text-muted text-sm">No payments yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
