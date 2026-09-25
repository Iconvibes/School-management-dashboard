export default function MetricCard({ icon: Icon, label, value, sub, accent = "brand", spark, sparkColor }) {
  const accents = {
    brand: "bg-brand-50 text-brand-600 ring-brand-600/10",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-600/10",
    amber: "bg-amber-50 text-amber-600 ring-amber-600/10",
    navy: "bg-navy-50 text-navy-700 ring-navy-600/10",
  };
  const accentDot = {
    brand: "#2563EB",
    emerald: "#10B981",
    amber: "#F59E0B",
    navy: "#334155",
  };

  // Normalize a plain number series into an SVG polyline (120×28 viewBox —
  // same pattern as the Schedule Health sparkline on the admin Overview).
  let points = null;
  if (Array.isArray(spark) && spark.length >= 2) {
    const nums = spark.map((n) => Number(n) || 0);
    const max = Math.max(...nums, 1);
    points = nums
      .map((v, i) => `${((i / (nums.length - 1)) * 120).toFixed(1)},${(28 - (v / max) * 26).toFixed(1)}`)
      .join(" ");
  }

  return (
    <div className="group rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-900/5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-navy-800">{value}</p>
          {sub && <p className="mt-1.5 text-xs font-medium text-navy-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${accents[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {points && (
        <div className="mt-3">
          <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
            <polyline
              points={points}
              fill="none"
              stroke={sparkColor || accentDot[accent]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
