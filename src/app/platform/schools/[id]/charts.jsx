"use client";

/**
 * SVG mini-charts for the platform school-detail page — extracted from
 * page.jsx (file-hygiene split). Pure presentational components.
 */

function SparkAreaChart({ data, dataKey, color = "#22d3ee", height = 120, showLabels = true, onMonthClick, selectedMonth }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d[dataKey] || 0);
  const max = Math.max(...values, 1);
  const padding = { top: 8, right: 8, bottom: showLabels ? 24 : 8, left: 8 };
  const w = 400;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / (values.length - 1)) * plotW,
    y: padding.top + plotH - (v / max) * plotH,
  }));

  // Smooth curve using quadratic bezier
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` Q ${prev.x + (cpx - prev.x) * 0.5} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
    pathD += ` Q ${curr.x - (curr.x - cpx) * 0.5} ${curr.y} ${curr.x} ${curr.y}`;
  }

  const areaD = pathD + ` L ${points[points.length - 1].x} ${padding.top + plotH} L ${points[0].x} ${padding.top + plotH} Z`;

  // Label indices (show every 3rd)
  const labelStep = Math.max(1, Math.floor(data.length / 4));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Area fill */}
      <path d={areaD} fill={`url(#grad-${dataKey})`} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Dots on last point */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill={color} opacity="0.2" />
      {/* Clickable month columns */}
      {onMonthClick && data.map((d, i) => {
        const colW = plotW / data.length;
        const x = padding.left + (i / data.length) * plotW;
        const isSelected = selectedMonth === d.key;
        return (
          <rect
            key={`col-${i}`}
            x={x}
            y={padding.top}
            width={colW}
            height={plotH}
            fill={isSelected ? "rgba(255,255,255,0.06)" : "transparent"}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={() => onMonthClick(isSelected ? null : d.key)}
            rx="4"
          />
        );
      })}
      {/* Data point dots for click targets */}
      {onMonthClick && points.map((pt, i) => (
        <circle
          key={`dot-${i}`}
          cx={pt.x}
          cy={pt.y}
          r={selectedMonth === data[i].key ? 6 : 4}
          fill={selectedMonth === data[i].key ? color : "rgba(255,255,255,0.3)"}
          stroke={selectedMonth === data[i].key ? "white" : "none"}
          strokeWidth={selectedMonth === data[i].key ? 2 : 0}
          style={{ cursor: "pointer", pointerEvents: "all", opacity: selectedMonth && selectedMonth !== data[i].key ? 0.4 : 1 }}
          onClick={() => onMonthClick(selectedMonth === data[i].key ? null : data[i].key)}
        />
      ))}
      {/* Labels */}
      {showLabels && data.map((d, i) => {
        if (i % labelStep !== 0 && i !== data.length - 1) return null;
        const isSelected = selectedMonth === d.key;
        return (
          <text
            key={i}
            x={points[i].x}
            y={h - 4}
            textAnchor="middle"
            className={onMonthClick ? "cursor-pointer" : ""}
            fill={isSelected ? "white" : "#6b7280"}
            style={{ fontSize: "9px", fontFamily: "inherit", fontWeight: isSelected ? 700 : 400 }}
            onClick={() => onMonthClick(isSelected ? null : d.key)}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

function BarChart({ data, height = 160 }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d.collected || 0);
  const max = Math.max(...values, 1);
  const padding = { top: 12, right: 8, bottom: 28, left: 8 };
  const w = 400;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const barW = Math.max(4, (plotW / data.length) * 0.6);
  const gap = (plotW - barW * data.length) / (data.length - 1 || 1);

  const labelStep = Math.max(1, Math.floor(data.length / 4));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const x = padding.left + i * (barW + gap);
        const barH = (d.collected / max) * plotH;
        const y = padding.top + plotH - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(1, barH)}
              rx="2"
              fill={isLast ? "url(#barGrad)" : "rgba(52,211,153,0.4)"}
            />
            {/* Value on top */}
            {barH > 20 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-emerald-400"
                style={{ fontSize: "7px", fontFamily: "inherit" }}
              >
                {d.collected > 0 ? formatCurrency(d.collected) : ""}
              </text>
            )}
            {/* Label */}
            {i % labelStep === 0 && (
              <text
                x={x + barW / 2}
                y={h - 6}
                textAnchor="middle"
                className="fill-gray-500"
                style={{ fontSize: "8px", fontFamily: "inherit" }}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * ForecastChart — combines historical bars with projected dashed bars + confidence band.
 * history: last 12 months of { label, collected }
 * forecast: { months: [{ label, projected, lower, upper }], ... }
 */
function ForecastChart({ history, forecast, height = 180 }) {
  if (!history || history.length === 0 || !forecast || !forecast.months) return null;

  const historical = history.slice(-9);
  const projected = forecast.months;
  const allValues = [
    ...historical.map((d) => d.collected || 0),
    ...projected.map((d) => d.upper || d.projected || 0),
  ];
  const max = Math.max(...allValues, 1);

  const padding = { top: 14, right: 8, bottom: 32, left: 8 };
  const w = 500;
  const h = height;
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const totalBars = historical.length + projected.length;
  const barW = Math.max(4, (plotW / totalBars) * 0.55);
  const gap = (plotW - barW * totalBars) / (totalBars - 1 || 1);

  // Build bar data
  const bars = [
    ...historical.map((d, i) => ({
      x: padding.left + i * (barW + gap),
      h: ((d.collected || 0) / max) * plotH,
      value: d.collected || 0,
      label: d.label,
      isForecast: false,
    })),
    ...projected.map((d, i) => ({
      x: padding.left + (historical.length + i) * (barW + gap),
      h: ((d.projected || 0) / max) * plotH,
      value: d.projected || 0,
      lower: d.lower || 0,
      upper: d.upper || 0,
      label: d.label,
      isForecast: true,
    })),
  ];

  // Divider line between historical and forecast
  const dividerX = padding.left + historical.length * (barW + gap) - gap / 2;

  const labelStep = Math.max(1, Math.floor(totalBars / 5));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="forecastBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="historicalBarGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <line
          key={frac}
          x1={padding.left}
          y1={padding.top + plotH * (1 - frac)}
          x2={padding.left + plotW}
          y2={padding.top + plotH * (1 - frac)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}
      {/* Confidence band for projected bars */}
      {bars.filter((b) => b.isForecast).map((b, i) => {
        const upperH = ((b.upper || 0) / max) * plotH;
        const lowerH = ((b.lower || 0) / max) * plotH;
        const cy = padding.top + plotH - upperH;
        const ch = upperH - lowerH;
        return (
          <rect
            key={`conf-${i}`}
            x={b.x - 2}
            y={cy}
            width={barW + 4}
            height={Math.max(1, ch)}
            rx="4"
            fill="rgba(129,140,248,0.08)"
            stroke="rgba(129,140,248,0.15)"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        );
      })}
      {/* Divider line */}
      <line
        x1={dividerX}
        y1={padding.top}
        x2={dividerX}
        y2={padding.top + plotH}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      {/* Divider labels */}
      <text
        x={dividerX - 6}
        y={padding.top - 2}
        textAnchor="end"
        fill="#6b7280"
        style={{ fontSize: "7px", fontFamily: "inherit" }}
      >
        Actual
      </text>
      <text
        x={dividerX + 6}
        y={padding.top - 2}
        textAnchor="start"
        fill="#818cf8"
        style={{ fontSize: "7px", fontFamily: "inherit" }}
      >
        Projected
      </text>
      {/* Bars */}
      {bars.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={padding.top + plotH - b.h}
            width={barW}
            height={Math.max(1, b.h)}
            rx="2"
            fill={b.isForecast ? "url(#forecastBarGrad)" : "url(#historicalBarGrad2)"
            }
            opacity={b.isForecast ? 0.7 : 0.9}
          />
          {/* Dashed top for projected */}
          {b.isForecast && (
            <line
              x1={b.x}
              y1={padding.top + plotH - b.h}
              x2={b.x + barW}
              y2={padding.top + plotH - b.h}
              stroke="#818cf8"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          )}
          {/* Value on top */}
          {b.h > 18 && (
            <text
              x={b.x + barW / 2}
              y={padding.top + plotH - b.h - 4}
              textAnchor="middle"
              fill={b.isForecast ? "#818cf8" : "#34d399"}
              style={{ fontSize: "7px", fontFamily: "inherit", fontWeight: 600 }}
            >
              {b.value > 0 ? formatCurrency(b.value) : ""}
            </text>
          )}
          {/* Label */}
          {i % labelStep === 0 && (
            <text
              x={b.x + barW / 2}
              y={h - 10}
              textAnchor="middle"
              fill={b.isForecast ? "#818cf8" : "#6b7280"}
              style={{ fontSize: "7px", fontFamily: "inherit", fontWeight: b.isForecast ? 600 : 400 }}
            >
              {b.label}
            </text>
          )}
        </g>
      ))}
      {/* Confidence range label */}
      <text
        x={padding.left + plotW}
        y={h - 2}
        textAnchor="end"
        fill="#4b5563"
        style={{ fontSize: "6px", fontFamily: "inherit" }}
      >
        Confidence range shown
      </text>
    </svg>
  );
}

/* ── Section Card ───────────────────────────────────────────── */


function SectionCard({ icon: Icon, iconColor, title, subtitle, children, headerRight }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0f1219]">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        {headerRight}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */


export { SparkAreaChart, BarChart, ForecastChart, SectionCard };
