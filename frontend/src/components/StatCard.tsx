export function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="card p-5">
      <p className="label-eyebrow">{label}</p>
      <p className="mono-figure text-3xl mt-2 text-ink">{value}</p>
      {sublabel && <p className="text-xs text-muted mt-1">{sublabel}</p>}
    </div>
  );
}
