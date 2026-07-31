"use client";

import { useId } from "react";
import { fmtPct } from "@/lib/format";

/**
 * Which way is good. Spend is deliberately neutral: spending more is neither a
 * win nor a loss on its own, and colouring it green would reward burning money.
 */
export type Direction = "up-good" | "down-good" | "neutral";

export function deltaOf(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return current / previous - 1;
}

/**
 * A 32px trend line. Purely supporting — the number is the message, this only
 * says whether it got there smoothly or spiked, so it carries no axis or label.
 */
export function Sparkline({
  values,
  direction = "neutral",
  width = 68,
  height = 22,
}: {
  values: (number | null)[];
  direction?: Direction;
  width?: number;
  height?: number;
}) {
  const id = useId();
  const points = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (points.length < 2) return <div style={{ width, height }} aria-hidden />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((v, i) => [i * step, height - ((v - min) / span) * (height - 3) - 1.5]);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  // Trend colour follows the metric's own direction, never the raw slope.
  const last = points[points.length - 1];
  const first = points[0];
  const rising = last >= first;
  const good = direction === "neutral" ? null : direction === "up-good" ? rising : !rising;
  const stroke =
    good === null ? "var(--text-muted)" : good ? "var(--delta-up)" : "var(--delta-down)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2} fill={stroke} />
    </svg>
  );
}

/** Delta pill. Always arrow + number + what it is compared against — never colour alone. */
export function Delta({
  value,
  direction,
  compareLabel,
}: {
  value: number | null;
  direction: Direction;
  compareLabel?: string;
}) {
  if (value == null) {
    return (
      <span className="text-[11px] text-[var(--text-muted)]">
        sin periodo previo para comparar
      </span>
    );
  }

  const up = value >= 0;
  const good = direction === "neutral" ? null : direction === "up-good" ? up : !up;
  const color =
    good === null ? "var(--text-secondary)" : good ? "var(--delta-up)" : "var(--delta-down)";
  const flat = Math.abs(value) < 0.005;

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[11px] min-w-0">
      <span
        className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md shrink-0"
        style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span>
        {flat ? "igual" : fmtPct(Math.abs(value), Math.abs(value) < 0.1 ? 1 : 0)}
      </span>
      {compareLabel ? (
        <span className="text-[var(--text-muted)] truncate">{compareLabel}</span>
      ) : null}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  delta,
  direction = "neutral",
  spark,
  compareLabel,
  featured = false,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  direction?: Direction;
  spark?: (number | null)[];
  compareLabel?: string;
  featured?: boolean;
}) {
  return (
    <div className={`kpi ${featured ? "kpi-featured" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="eyebrow truncate">{label}</div>
        {spark?.length ? <Sparkline values={spark} direction={direction} /> : null}
      </div>

      <div className={`hero-figure truncate ${featured ? "kpi-gold" : ""}`}>{value}</div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 min-h-[18px]">
        {delta !== undefined ? <Delta value={delta} direction={direction} compareLabel={compareLabel} /> : null}
      </div>

      {sub ? <div className="text-[11px] text-[var(--text-muted)] truncate mt-1">{sub}</div> : null}
    </div>
  );
}
