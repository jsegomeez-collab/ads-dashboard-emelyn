"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  ReferenceLine,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtCompact, fmtDayShort, fmtMoney, fmtNum, fmtPct } from "@/lib/format";

/* ---------------------------------------------------------------- chrome -- */

const AXIS = {
  tick: { fontSize: 11, fill: "var(--text-muted)" },
  axisLine: { stroke: "var(--baseline)" },
  tickLine: false,
} as const;

const GRID = { stroke: "var(--gridline)", strokeDasharray: "0" } as const;

interface Row { [k: string]: string | number | null }

/**
 * Every chart is wrapped in this. It carries the title, the optional legend,
 * and the table view — which is not decoration: three light-mode series sit
 * below 3:1 on the cream surface, so the relief rule requires the values be
 * readable another way. Removing it would leave the palette non-compliant.
 */
export function ChartFrame({
  title,
  hint,
  children,
  rows,
  columns,
  height = 220,
  legend,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  rows: Row[];
  columns: { key: string; label: string; format?: (v: never) => string }[];
  height?: number;
  legend?: { color: string; label: string }[];
}) {
  const [table, setTable] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-tight truncate">{title}</div>
          {hint ? <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{hint}</div> : null}
        </div>
        <button
          className="chip shrink-0"
          data-on={table}
          onClick={() => setTable((v) => !v)}
          aria-pressed={table}
        >
          {table ? "Gráfico" : "Tabla"}
        </button>
      </div>

      {legend && legend.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 mt-1">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      ) : null}

      {table ? (
        <div className="scroll-x max-h-[280px] overflow-y-auto mt-2">
          <table className="w-full text-[12px] tnum">
            <thead className="sticky top-0" style={{ background: "var(--surface-1)" }}>
              <tr className="text-left text-[var(--text-muted)]">
                {columns.map((c) => (
                  <th key={c.key} className="py-1.5 pr-3 font-medium whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--hairline)" }}>
                  {columns.map((c) => (
                    <td key={c.key} className="py-1.5 pr-3 whitespace-nowrap">
                      {c.format ? c.format(row[c.key] as never) : String(row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} className="mt-1">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TipBox({
  label,
  items,
}: {
  label: string;
  items: { name: string; value: string; color?: string }[];
}) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-[12px]"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--hairline-strong)",
        boxShadow: "var(--shadow-lift)",
      }}
    >
      <div className="font-semibold mb-1">{label}</div>
      {items.map((it) => (
        <div key={it.name} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
            {it.color ? (
              <span className="inline-block rounded-sm" style={{ width: 8, height: 8, background: it.color }} />
            ) : null}
            {it.name}
          </span>
          <span className="tnum font-medium">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the charts -- */

type Daily = { date: string; spend: number; leads: number; cpl: number | null; clicks: number; impressions: number };

/**
 * Spend and leads are different measures on different scales, so they get two
 * aligned charts sharing one x axis — never a second y axis on one plot.
 */
export function SpendChart({ data }: { data: Daily[] }) {
  return (
    <ChartFrame
      title="Inversión diaria"
      hint="Área en dorado. Pasa el cursor para ver el día."
      height={170}
      rows={data as unknown as Row[]}
      columns={[
        { key: "date", label: "Fecha" },
        { key: "spend", label: "Inversión", format: (v) => fmtMoney(v as number) },
      ]}
    >
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id="aurum-spend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} minTickGap={18} />
        <YAxis {...AXIS} width={44} tickFormatter={(v) => fmtCompact(v as number)} />
        <Tooltip
          cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={fmtDayShort(String(label))}
                items={[{ name: "Inversión", value: fmtMoney(payload[0].value as number), color: "var(--series-1)" }]}
              />
            ) : null
          }
        />
        <Area
        isAnimationActive={false}
          type="monotone"
          dataKey="spend"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="url(#aurum-spend)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

export function LeadsChart({ data }: { data: Daily[] }) {
  return (
    <ChartFrame
      title="Leads cualificados por día"
      hint="Solo los que superan 3 de scoring. Mismo eje temporal que la inversión."
      height={170}
      rows={data as unknown as Row[]}
      columns={[
        { key: "date", label: "Fecha" },
        { key: "leads", label: "Leads cual.", format: (v) => fmtNum(v as number) },
        { key: "cpl", label: "CPL", format: (v) => fmtMoney(v as number) },
      ]}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap={2}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} minTickGap={18} />
        <YAxis {...AXIS} width={44} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={fmtDayShort(String(label))}
                items={[
                  { name: "Leads cual.", value: fmtNum(payload[0].value as number), color: "var(--series-3)" },
                  { name: "CPL", value: fmtMoney((payload[0].payload as Daily).cpl) },
                ]}
              />
            ) : null
          }
        />
        {/* 2px surface gap between adjacent bars, rounded data-end at the top */}
        <Bar isAnimationActive={false} dataKey="leads" fill="var(--series-3)" radius={[4, 4, 0, 0]} stroke="var(--surface-1)" strokeWidth={1} />
      </BarChart>
    </ChartFrame>
  );
}

export function CplTrendChart({ data }: { data: Daily[] }) {
  const points = data.filter((d) => d.cpl != null);
  return (
    <ChartFrame
      title="Coste por lead cualificado"
      hint="Solo días con leads. Menos es mejor."
      height={170}
      rows={points as unknown as Row[]}
      columns={[
        { key: "date", label: "Fecha" },
        { key: "cpl", label: "CPL", format: (v) => fmtMoney(v as number) },
        { key: "leads", label: "Leads cual.", format: (v) => fmtNum(v as number) },
      ]}
    >
      <LineChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} minTickGap={18} />
        <YAxis {...AXIS} width={48} tickFormatter={(v) => fmtCompact(v as number)} />
        <Tooltip
          cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={fmtDayShort(String(label))}
                items={[
                  { name: "CPL", value: fmtMoney(payload[0].value as number), color: "var(--series-2)" },
                  { name: "Leads", value: fmtNum((payload[0].payload as Daily).leads) },
                ]}
              />
            ) : null
          }
        />
        <Line
        isAnimationActive={false}
          type="monotone"
          dataKey="cpl"
          stroke="var(--series-2)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: "var(--series-2)" }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface-1)" }}
        />
      </LineChart>
    </ChartFrame>
  );
}

type Ranked = { key: string; spend: number; leads: number; cpl: number | null; ctr: number | null };

/**
 * Nominal categories (campaign names) all take slot 1 — coloring each bar
 * differently would spend the identity channel re-encoding what bar length
 * already shows.
 */
export function SpendByChart({ title, hint, data }: { title: string; hint: string; data: Ranked[] }) {
  const top = data.slice(0, 8);
  return (
    <ChartFrame
      title={title}
      hint={hint}
      height={Math.max(160, top.length * 34 + 24)}
      rows={top as unknown as Row[]}
      columns={[
        { key: "key", label: "Nombre" },
        { key: "spend", label: "Inversión", format: (v) => fmtMoney(v as number) },
        { key: "leads", label: "Leads cual.", format: (v) => fmtNum(v as number) },
        { key: "cpl", label: "CPL", format: (v) => fmtMoney(v as number) },
      ]}
    >
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 62, left: 4, bottom: 4 }} barCategoryGap={4}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v) => fmtCompact(v as number)} />
        <YAxis
          type="category"
          dataKey="key"
          {...AXIS}
          width={150}
          interval={0}
          // One line per category — wrapped labels stack and collide at this row height.
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Ranked;
            return (
              <TipBox
                label={p.key}
                items={[
                  { name: "Inversión", value: fmtMoney(p.spend), color: "var(--series-1)" },
                  { name: "Leads", value: fmtNum(p.leads) },
                  { name: "CPL", value: fmtMoney(p.cpl) },
                  { name: "CTR", value: fmtPct(p.ctr, 2) },
                ]}
              />
            );
          }}
        />
        {/* No minPointSize here: it collapses every bar to the same sliver and
            drops the x axis, which is far worse than a tight label on a tiny bar. */}
        <Bar isAnimationActive={false} dataKey="spend" fill="var(--series-1)" radius={[0, 4, 4, 0]} stroke="var(--surface-1)" strokeWidth={1}>
          {/* direct labels — the relief channel for the sub-3:1 gold fill */}
          <LabelList
            dataKey="spend"
            position="right"
            offset={8}
            formatter={(v: number) => fmtMoney(v, 0)}
            style={{ fontSize: 11, fill: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/**
 * Ordinal ramp — funnel stages have an inherent order, so the color carries it
 * (one hue, monotone lightness) rather than eight unrelated identities.
 */
export function FunnelChart({
  stages,
}: {
  stages: { label: string; value: number; rate: number | null }[];
}) {
  const RAMP = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

  return (
    <div className="card p-4">
      <div className="text-[13px] font-semibold tracking-tight mb-0.5">Embudo de la cuenta</div>
      <div className="text-[11px] text-[var(--text-muted)] mb-4">
        La barra mide la conversión desde el paso anterior; el número es el total. En absoluto las
        impresiones aplastarían al resto y no se vería dónde se pierde la gente.
      </div>
      <div className="space-y-2.5">
        {stages.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12px] text-[var(--text-secondary)] truncate">{s.label}</span>
              <span className="text-[12px] font-semibold tnum shrink-0">
                {fmtNum(s.value)}
                {s.rate == null ? null : s.rate > 1 ? (
                  // Meta counts these events independently, so a "conversion" above
                  // 100% is real data, not a bug — but it is not a funnel step.
                  <span
                    className="text-[var(--text-muted)] font-normal"
                    title="Meta atribuye este evento por su cuenta, así que puede superar al paso anterior."
                  >
                    {" "}· {fmtPct(s.rate, 0)}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] font-normal"> · {fmtPct(s.rate, 1)}</span>
                )}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, Math.max((s.rate == null ? 1 : s.rate) * 100, s.value > 0 ? 2 : 0))}%`,
                  background: RAMP[i % RAMP.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type AdPoint = { adName: string; spend: number; cpl: number | null; leads: number };

/**
 * Scatter is an all-pairs form, where the validated cap for this palette is two
 * slots — so identity comes from position and direct labels, and every mark
 * takes the same hue.
 */
export function AdScatter({ data, avgCpl }: { data: AdPoint[]; avgCpl: number | null }) {
  const base = data.filter((d) => d.cpl != null && d.spend > 0);
  // Selective direct labels: only the biggest spenders get named, so the plot
  // stays readable. Every point is still identifiable via hover and the table.
  const named = new Set([...base].sort((a, b) => b.spend - a.spend).slice(0, 4).map((d) => d.adName));
  const points = base.map((d) => ({ ...d, tag: named.has(d.adName) ? d.adName : "" }));
  if (!points.length) {
    return (
      <div className="card p-4">
        <div className="text-[13px] font-semibold mb-1">Inversión vs coste por lead</div>
        <div className="text-[12px] text-[var(--text-muted)] py-8 text-center">
          Ningún anuncio ha generado leads todavía en esta ventana.
        </div>
      </div>
    );
  }
  return (
    <ChartFrame
      title="Inversión vs coste por lead"
      hint={`Tamaño = leads. Abajo a la derecha es lo mejor: mucho gasto con CPL bajo.${avgCpl != null ? ` Media de la cuenta: ${fmtMoney(avgCpl)}.` : ""}`}
      height={260}
      rows={points as unknown as Row[]}
      columns={[
        { key: "adName", label: "Anuncio" },
        { key: "spend", label: "Inversión", format: (v) => fmtMoney(v as number) },
        { key: "leads", label: "Leads cual.", format: (v) => fmtNum(v as number) },
        { key: "cpl", label: "CPL", format: (v) => fmtMoney(v as number) },
      ]}
    >
      <ScatterChart margin={{ top: 14, right: 22, left: 4, bottom: 16 }}>
        <CartesianGrid {...GRID} />
        <XAxis
          type="number"
          dataKey="spend"
          name="Inversión"
          {...AXIS}
          tickFormatter={(v) => fmtCompact(v as number)}
          label={{ value: "Inversión", position: "insideBottom", offset: -8, fontSize: 11, fill: "var(--text-muted)" }}
        />
        <YAxis
          type="number"
          dataKey="cpl"
          name="CPL"
          {...AXIS}
          width={48}
          tickFormatter={(v) => fmtCompact(v as number)}
        />
        <ZAxis type="number" dataKey="leads" range={[80, 460]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: "var(--baseline)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as AdPoint;
            return (
              <TipBox
                label={p.adName}
                items={[
                  { name: "Inversión", value: fmtMoney(p.spend), color: "var(--series-1)" },
                  { name: "Leads", value: fmtNum(p.leads) },
                  { name: "CPL", value: fmtMoney(p.cpl) },
                ]}
              />
            );
          }}
        />
        <Scatter isAnimationActive={false} data={points} fill="var(--series-1)" fillOpacity={0.75}>
          {points.map((p, i) => (
            // 2px surface ring so overlapping marks stay countable
            <Cell key={i} stroke="var(--surface-1)" strokeWidth={2} />
          ))}
          <LabelList
            dataKey="tag"
            position="top"
            offset={10}
            style={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 500 }}
          />
        </Scatter>
      </ScatterChart>
    </ChartFrame>
  );
}


/* --------------------------------------------------- CPL against the bar -- */

type CplRow = { adName: string; cpl: number | null; leads: number; spend: number; thin: boolean };

/**
 * Every ad's cost per qualified lead against the account average.
 *
 * One hue for every bar and a reference line for the benchmark: position does
 * the comparing, so the identity channel is not spent re-encoding a value the
 * bar length already shows. Ads without enough sample are drawn hollow and kept
 * at the bottom rather than ranked on a CPL that means nothing yet.
 */
export function CplByAdChart({ data, average }: { data: CplRow[]; average: number | null }) {
  const rows = data
    .filter((d) => d.cpl != null)
    .sort((a, b) => Number(a.thin) - Number(b.thin) || a.cpl! - b.cpl!)
    .slice(0, 10);

  if (!rows.length) {
    return (
      <div className="card p-4">
        <div className="text-[13px] font-semibold mb-1">Coste por lead por anuncio</div>
        <div className="text-[12px] text-[var(--text-muted)] py-8 text-center">
          Ningún anuncio ha generado leads cualificados todavía.
        </div>
      </div>
    );
  }

  return (
    <ChartFrame
      title="Coste por lead por anuncio"
      hint={`Ordenado de más barato a más caro. La línea es la media de la cuenta${average ? ` (${fmtMoney(average)})` : ""}. Las barras huecas aún no tienen muestra suficiente.`}
      height={Math.max(180, rows.length * 32 + 30)}
      rows={rows as unknown as Row[]}
      columns={[
        { key: "adName", label: "Anuncio" },
        { key: "cpl", label: "CPL cual.", format: (v) => fmtMoney(v as number) },
        { key: "leads", label: "Leads", format: (v) => fmtNum(v as number) },
        { key: "spend", label: "Inversión", format: (v) => fmtMoney(v as number) },
      ]}
    >
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 62, left: 4, bottom: 4 }} barCategoryGap={4}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v) => fmtCompact(v as number)} />
        <YAxis
          type="category"
          dataKey="adName"
          {...AXIS}
          width={150}
          interval={0}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as CplRow;
            return (
              <TipBox
                label={p.adName}
                items={[
                  { name: "CPL cualificado", value: fmtMoney(p.cpl), color: "var(--series-1)" },
                  { name: "Leads", value: fmtNum(p.leads) },
                  { name: "Inversión", value: fmtMoney(p.spend) },
                  ...(p.thin ? [{ name: "Aviso", value: "poca muestra" }] : []),
                ]}
              />
            );
          }}
        />
        {average != null ? (
          <ReferenceLine
            x={average}
            stroke="var(--text-muted)"
            strokeDasharray="4 3"
            label={{ value: "media", position: "top", fontSize: 10, fill: "var(--text-muted)" }}
          />
        ) : null}
        <Bar isAnimationActive={false} dataKey="cpl" radius={[0, 4, 4, 0]} stroke="var(--series-1)" strokeWidth={1}>
          {rows.map((r, i) => (
            // Hollow = no verdict yet. Shape carries it, so it survives greyscale.
            <Cell key={i} fill={r.thin ? "transparent" : "var(--series-1)"} />
          ))}
          <LabelList
            dataKey="cpl"
            position="right"
            offset={8}
            formatter={(v: number) => fmtMoney(v)}
            style={{ fontSize: 11, fill: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------- intake vs qualified --- */

type QualityDay = { date: string; registrations: number; leads: number; qualificationRate: number | null };

/**
 * Daily intake split into what qualified and what did not. Stacked, because the
 * two parts sum to the whole — the gap IS the story, and reading it as two
 * separate lines would hide that.
 */
export function QualityChart({ data }: { data: QualityDay[] }) {
  const rows = data.map((d) => ({ ...d, unqualified: Math.max(0, d.registrations - d.leads) }));
  return (
    <ChartFrame
      title="Registrados y cuántos cualifican"
      hint="Dorado: supera 3 de scoring. Violeta: se registró pero no cualifica."
      height={170}
      legend={[
        { color: "var(--series-1)", label: "Leads cualificados" },
        { color: "var(--series-2)", label: "No cualifican" },
      ]}
      rows={rows as unknown as Row[]}
      columns={[
        { key: "date", label: "Fecha" },
        { key: "registrations", label: "Registrados", format: (v) => fmtNum(v as number) },
        { key: "leads", label: "Cualificados", format: (v) => fmtNum(v as number) },
        { key: "qualificationRate", label: "% cualif.", format: (v) => fmtPct(v as number, 0) },
      ]}
    >
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap={2}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} minTickGap={18} />
        <YAxis {...AXIS} width={44} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as QualityDay & { unqualified: number };
            return (
              <TipBox
                label={fmtDayShort(String(label))}
                items={[
                  { name: "Registrados", value: fmtNum(p.registrations) },
                  { name: "Cualificados", value: fmtNum(p.leads), color: "var(--series-1)" },
                  { name: "No cualifican", value: fmtNum(p.unqualified), color: "var(--series-2)" },
                  { name: "Tasa", value: fmtPct(p.qualificationRate, 0) },
                ]}
              />
            );
          }}
        />
        {/* 2px surface gap between stacked segments keeps them countable. */}
        <Bar isAnimationActive={false} dataKey="leads" stackId="q" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="unqualified" stackId="q" fill="var(--series-2)" radius={[4, 4, 0, 0]} stroke="var(--surface-1)" strokeWidth={1} />
      </BarChart>
    </ChartFrame>
  );
}
