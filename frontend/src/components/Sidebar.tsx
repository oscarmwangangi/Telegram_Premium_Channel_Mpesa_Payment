import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/users", label: "Users" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/payments", label: "Payments" },
  { to: "/plans", label: "Plans" },
  { to: "/announcements", label: "Announcements" },
];

export function Sidebar() {
  const { admin, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 border-r border-hairline bg-surface flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-hairline">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-signal" />
          </span>
          <span className="label-eyebrow">Live</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Ops Console</h1>
        <p className="text-xs text-muted mt-0.5">Premium channel access control</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? "bg-raised text-ink font-medium" : "text-muted hover:text-ink hover:bg-raised/60"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-hairline">
        <div className="px-3 mb-2">
          <p className="text-sm text-ink truncate">{admin?.name}</p>
          <p className="text-[11px] text-muted uppercase tracking-wide">{admin?.role?.replace("_", " ") || " "}</p>
        </div>
        <button onClick={() => logout()} className="btn-ghost w-full text-xs">
          Sign out
        </button>
      </div>
    </aside>
  );
}
