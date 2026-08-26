"use client";

import { useEffect, useState, useMemo } from "react";

/**
 * ActivityHeatmap — GitHub-style calendar grid showing admin action frequency.
 * Uses cyan/teal theme matching the platform dashboard.
 */
export default function ActivityHeatmap({ className = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/platform/audit/heatmap");
        if (!res.ok) throw new Error("Failed to load heatmap");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Build a 7×13 grid from the 90-day data
  const { grid, monthLabels } = useMemo(() => {
    if (!data?.days) return { grid: [], monthLabels: [] };
    const countMap = {};
    for (const d of data.days) countMap[d.date] = d.count;

    const endDate = new Date(data.days[data.days.length - 1].date);
    const startDate = new Date(data.days[0].date);

    const weeks = [];
    let cur = new Date(startDate);
    cur.setDate(cur.getDate() - cur.getDay()); // back to Sunday

    const labels = [];
    let lastMonth = -1;

    while (cur <= endDate || weeks.length < 13) {
      const week = [];
      for (let dow = 0; dow < 7; dow++) {
        const dateStr = cur.toISOString().slice(0, 10);
        week.push({ date: dateStr, count: countMap[dateStr] ?? null });
        cur.setDate(cur.getDate() + 1);
      }
      // month label
      const firstDay = week.find((d) => d.count !== null);
      if (firstDay) {
        const m = new Date(firstDay.date).getMonth();
        if (m !== lastMonth) {
          labels.push({ week: weeks.length, name: new Date(firstDay.date).toLocaleString("en", { month: "short" }) });
          lastMonth = m;
        }
      }
      weeks.push(week);
      if (weeks.length >= 14 && cur > endDate) break;
    }

    return { grid: weeks.slice(0, 13), monthLabels: labels };
  }, [data]);

  const maxCount = data?.maxCount || 1;

  function getLevel(count) {
    if (count === null || count === undefined) return -1;
    if (count === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  // Cyan palette — bright enough to stand out on dark backgrounds
  const LEVEL_COLORS = [
    "#1e293b",  // 0 — empty (slate-800, clearly visible)
    "#0e4429",  // 1 — low
    "#006d32",  // 2 — medium
    "#26a641",  // 3 — high
    "#39d353",  // 4 — max
  ];

  const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

  const totalActions = data?.days?.reduce((sum, d) => sum + d.count, 0) || 0;
  const activeDays = data?.days?.filter((d) => d.count > 0).length || 0;
  const avgPerDay = activeDays > 0 ? (totalActions / activeDays).toFixed(1) : "0";

  if (loading) {
    return (
      <div className={`platform-card p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        </div>
      </div>
    );
  }

  return (
    <div className={`platform-card p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-white">Activity Heatmap</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Admin actions over the last 90 days</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span><strong className="text-white">{totalActions}</strong> actions</span>
          <span className="text-zinc-700">·</span>
          <span><strong className="text-white">{activeDays}</strong> active days</span>
          <span className="text-zinc-700">·</span>
          <span><strong className="text-emerald-400">{avgPerDay}</strong> avg/day</span>
        </div>
      </div>

      {/* Heatmap Grid — rendered as an SVG for precise control */}
      <div className="flex justify-center overflow-x-auto pb-2">
        <svg
          width={grid.length * 19 + 40}
          height={7 * 19 + 20}
          viewBox={`0 0 ${grid.length * 19 + 40} ${7 * 19 + 20}`}
          className="block"
        >
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={40 + m.week * 19}
              y={12}
              className="fill-zinc-500"
              fontSize="11"
              fontFamily="system-ui, sans-serif"
            >
              {m.name}
            </text>
          ))}

          {/* Day-of-week labels */}
          {DAY_LABELS.map((label, i) => (
            <text
              key={i}
              x={0}
              y={20 + i * 19 + 13}
              className="fill-zinc-500"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
              textAnchor="start"
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {grid.map((week, wi) =>
            week.map((day, di) => {
              const level = getLevel(day.count);
              const color = level >= 0 ? LEVEL_COLORS[level] : "transparent";
              const x = 40 + wi * 19;
              const y = 20 + di * 19;
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={15}
                  height={15}
                  rx={3}
                  ry={3}
                  fill={color}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseEnter={(e) => {
                    const svg = e.currentTarget.closest("svg");
                    const rect = svg.getBoundingClientRect();
                    const cellX = rect.left + x + 7.5;
                    const cellY = rect.top + y;
                    setTooltip({ x: cellX, y: cellY, date: day.date, count: day.count ?? 0 });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end mt-2 gap-1.5">
        <span className="text-[10px] text-zinc-500 mr-1">Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <div
            key={i}
            className="rounded-[2px]"
            style={{ width: 12, height: 12, backgroundColor: color }}
          />
        ))}
        <span className="text-[10px] text-zinc-500 ml-1">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 shadow-2xl text-xs whitespace-nowrap">
            <span className="font-semibold text-green-400">
              {tooltip.count} action{tooltip.count !== 1 ? "s" : ""}
            </span>
            <span className="text-zinc-400 ml-2">
              {new Date(tooltip.date + "T00:00:00").toLocaleDateString("en", {
                month: "short", day: "numeric", year: "numeric",
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
