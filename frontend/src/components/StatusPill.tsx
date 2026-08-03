const COLORS: Record<string, string> = {
  ACTIVE: "bg-active",
  SUCCESS: "bg-active",
  JOINED: "bg-active",
  PENDING: "bg-signal",
  INVITED: "bg-signal",
  QUEUED: "bg-signal",
  EXPIRED: "bg-danger",
  FAILED: "bg-danger",
  BANNED: "bg-danger",
  CANCELLED: "bg-muted",
  SUSPENDED: "bg-danger",
  TIMEOUT: "bg-danger",
};

export function StatusPill({ status }: { status: string }) {
  const color = COLORS[status] ?? "bg-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span className="text-muted">{status.replace(/_/g, " ")}</span>
    </span>
  );
}
