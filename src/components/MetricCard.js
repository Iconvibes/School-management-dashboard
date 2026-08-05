export default function MetricCard({ icon: Icon, label, value, sub, accent = "brand" }) {
  const accents = {
    brand: "bg-brand-50 text-brand-600 ring-brand-600/10",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-600/10",
    amber: "bg-amber-50 text-amber-600 ring-amber-600/10",
    navy: "bg-navy-50 text-navy-700 ring-navy-600/10",
  };

  return (
    <div className="group rounded-2xl border border-navy-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-900/5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-navy-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-navy-800">{value}</p>
          {sub && <p className="mt-1.5 text-xs font-medium text-navy-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${accents[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
