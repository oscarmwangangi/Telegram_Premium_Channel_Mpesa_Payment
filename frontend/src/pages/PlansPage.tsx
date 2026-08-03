import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Plan } from "@/types/api";
import { useAuth } from "@/context/AuthContext";

export function PlansPage() {
  const { admin } = useAuth();
  const canManage = admin?.role === "SUPER_ADMIN";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    api.get<Plan[]>("/admin/plans").then(({ data }) => setPlans(data)).catch(() => {});
  }
  useEffect(load, []);

  async function disable(id: string) {
    await api.patch(`/admin/plans/${id}/disable`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Plans</h2>
          <p className="text-muted text-sm mt-1">Pricing and duration for channel access.</p>
        </div>
        {canManage && (
          <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            New plan
          </button>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-muted">
          Plan pricing changes are restricted to Super Admin accounts.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.id} className={`card p-5 ${!p.isActive ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{p.name}</h3>
                <p className="text-xs text-muted mono-figure mt-0.5">{p.code}</p>
              </div>
              <p className="mono-figure text-xl">${Number(p.priceUsd).toFixed(2)}</p>
            </div>
            <p className="text-sm text-muted mt-2">{p.description}</p>
            <p className="text-xs text-muted mt-1">{p.durationDays} days</p>
            {canManage && p.isActive && (
              <button onClick={() => disable(p.id)} className="btn-danger text-xs mt-4">
                Disable
              </button>
            )}
            {!p.isActive && <p className="text-xs text-danger mt-4">Disabled</p>}
          </div>
        ))}
      </div>

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", priceUsd: "", durationDays: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/admin/plans", {
        code: form.code,
        name: form.name,
        priceUsd: Number(form.priceUsd),
        durationDays: Number(form.durationDays),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create plan.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card p-6 w-full max-w-sm space-y-4"
      >
        <h3 className="font-medium">New plan</h3>
        <input
          className="input w-full"
          placeholder="Code (e.g. QUARTERLY)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          required
        />
        <input
          className="input w-full"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input w-full"
          placeholder="Price (USD)"
          type="number"
          step="0.01"
          value={form.priceUsd}
          onChange={(e) => setForm({ ...form, priceUsd: e.target.value })}
          required
        />
        <input
          className="input w-full"
          placeholder="Duration (days)"
          type="number"
          value={form.durationDays}
          onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
          required
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
