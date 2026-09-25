"use client";

import { useId } from "react";

/**
 * Lightweight, dependency-free SVG charts for the admin Overview.
 *
 * Deliberately NOT a charting library: the project ships zero chart deps, and
 * these three primitives cover the dashboard's needs with hand-rolled SVG
 * (the same approach the existing Schedule Health sparkline uses). They are
 * pure presentational components — data comes in already shaped, formatting is
 * injected via props so callers control currency/date styles.
 */

const NAVY_LINE = "#e2e8f0"; // slate-200 — gridlines on white cards

function ChartEmpty({ message }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-navy-200 bg-navy-50/40 text-sm text-navy-400">
      {message}
    </div>
  );
}

/**
 * Area chart (line + gradient fill) for time series.
 * data: [{ label, value }] — label shown on the axis row, value plotted.
 */
export function AreaChart({ data, height = 190, color = "#2563EB", formatValue }) {
  const gid = useId();
  if (!data || data.length === 0) {
    return <ChartEmpty message="No data yet" />;
  }
  // A single point still renders: flatten it across the width so the very
  // first days of data (or a one-day seed) show the level instead of an
  // empty card. The labels row keeps just that one date.
  const series = data.length === 1 ? [data[0], { ...data[0] }] : data;
  const w = 600;
  const h = 220;
  const padL = 4;
  const padR = 4;
  const padT = 16;
  const padB = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...series.map((d) => Number(d.value) || 0), 1);
  const stepX = innerW / (series.length - 1);
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + innerH - ((Number(v) || 0) / max) * innerH;
  const line = series.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} ${x(series.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} ${x(0).toFixed(1)},${(padT + innerH).toFixed(1)}`;
  const last = data[data.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={padT + innerH / 2} x2={w - padR} y2={padT + innerH / 2} stroke={NAVY_LINE} strokeWidth="1" strokeDasharray="4 4" />
        <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke={NAVY_LINE} strokeWidth="1" />
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium text-navy-400">
        <span>{data[0].label}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
          {formatValue ? formatValue(last.value) : last.value}
        </span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}

/**
 * Donut chart for part-to-whole breakdowns.
 * segments: [{ label, value, color }] — drawn clockwise from the top.
 */
export function DonutChart({ segments, size = 180, thickness = 22, formatValue, centerLabel }) {
  const total = segments.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
  if (total <= 0 || segments.length === 0) {
    return <ChartEmpty message="No data yet" />;
  }
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // Pre-compute each arc's dash length + offset (pure read in the JSX below).
  const arcs = segments.reduce((acc, s) => {
    const len = ((Number(s.value) || 0) / total) * c;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ label: s.label, color: s.color, value: s.value, len, offset });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.len.toFixed(2)} ${(c - s.len).toFixed(2)}`}
              strokeDashoffset={(-s.offset).toFixed(2)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold tracking-tight text-navy-800">
            {formatValue ? formatValue(total) : total}
          </span>
          {centerLabel && <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{centerLabel}</span>}
        </div>
      </div>
      <div className="mt-4 w-full space-y-2">
        {segments.map((s) => {
          const pct = total ? Math.round(((Number(s.value) || 0) / total) * 100) : 0;
          return (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-navy-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="font-bold text-navy-800">
                {formatValue ? formatValue(s.value) : s.value}
                <span className="ml-1.5 font-medium text-navy-400">{pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Stacked day bars (present + absent) for attendance trends.
 * data: [{ label, present, absent }]
 */
export function DayBars({ data, height = 180, presentColor = "#10b981", absentColor = "#fb7185" }) {
  if (!data || data.length === 0) {
    return <ChartEmpty message="No attendance marked yet" />;
  }
  const w = 600;
  const h = 220;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...data.map((d) => (Number(d.present) || 0) + (Number(d.absent) || 0)), 1);
  const stepX = innerW / data.length;
  const barW = Math.max(10, stepX * 0.55);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
        <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke={NAVY_LINE} strokeWidth="1" />
        {data.map((d, i) => {
          const cx = padL + i * stepX + stepX / 2;
          const bx = cx - barW / 2;
          const totalH = (((Number(d.present) || 0) + (Number(d.absent) || 0)) / max) * innerH;
          const presentH = ((Number(d.present) || 0) / max) * innerH;
          return (
            <g key={i}>
              <rect x={bx} y={padT + innerH - totalH} width={barW} height={totalH} fill={absentColor} opacity="0.9" />
              <rect x={bx} y={padT + innerH - presentH} width={barW} height={presentH} fill={presentColor} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-navy-400">
        {data.map((d, i) => (
          <span key={i} className={i % 2 === 1 ? "text-navy-300" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
