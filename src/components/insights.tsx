"use client";

import type { Metrics } from "@/lib/types";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { fmtDayShort } from "@/lib/format";

const leadWord = (n: number) => (n === 1 ? "lead" : "leads");

/** Dense row of secondary metrics — everything worth knowing, none of it shouting. */
export function MetricStrip({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="card p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-5 gap-y-3.5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0" title={it.hint}>
            <div className="eyebrow truncate mb-1">{it.label}</div>
            <div className="text-[15px] font-semibold tnum tracking-tight truncate">{it.value}</div>
            {it.hint ? (
              <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{it.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What a single euro turns into as it walks the funnel. Each step shows what one
 * outcome costs and how much dearer it got than the step before — which is where
 * the leak actually is, not in the headline CPL.
 */
export function CostLadder({ m }: { m: Metrics }) {
  const steps = [
    { label: "Una impresión", cost: m.cpm == null ? null : m.cpm / 1000, count: m.impressions },
    { label: "Un clic", cost: m.cpc, count: m.clicks },
    { label: "Un clic en enlace", cost: m.costPerLinkClick, count: m.linkClicks },
    { label: "Una vista de landing", cost: m.costPerLandingPageView, count: m.landingPageViews },
    { label: "Un registrado", cost: m.cpr, count: m.registrations },
    { label: "Un lead cualificado", cost: m.cpl, count: m.leads },
  ];

  const max = Math.max(...steps.map((s) => s.cost ?? 0), 1);

  return (
    <div className="card p-4">
      <div className="text-[13px] font-semibold tracking-tight mb-0.5">Escalera de costes</div>
      <div className="text-[11px] text-[var(--text-muted)] mb-4">
        Lo que cuesta UNA unidad de cada paso y cuánto se encarece respecto al anterior. Se
        destaca el mayor salto entre pasos de conversión: el de impresión a clic es el inverso
        del CTR y siempre sería el mayor.
      </div>

      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].cost : null;
          const mult = prev && s.cost ? s.cost / prev : null;
          const share = s.cost ? (s.cost / max) * 100 : 0;
          // The impression → click jump is the inverse of CTR, so it dominates
          // this ladder by construction and would always be flagged. The useful
          // signal is the steepest jump among the CONVERSION steps after it.
          const jumps = steps.map((x, j) =>
            j > 1 && steps[j - 1].cost && x.cost ? x.cost! / steps[j - 1].cost! : 0,
          );
          const worst = i > 1 && mult != null && mult === Math.max(...jumps);

          return (
            <div key={s.label}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[12px] text-[var(--text-secondary)] truncate">
                  {s.label}
                  <span className="text-[var(--text-muted)]"> · {fmtNum(s.count)}</span>
                </span>
                <span className="text-[12px] tnum shrink-0">
                  <span className="font-semibold">{s.cost != null && s.cost < 0.1 ? fmtMoney(s.cost, 4) : fmtMoney(s.cost)}</span>
                  {mult != null ? (
                    <span
                      className={worst ? "font-semibold" : "font-normal"}
                      style={{ color: worst ? "var(--status-serious)" : "var(--text-muted)" }}
                    >
                      {" "}×{mult.toFixed(1)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(share, s.cost ? 2 : 0)}%`, background: "var(--series-1)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Where the window is heading if nothing changes, plus the two days worth
 * looking at. Projections are labelled as such — they are arithmetic on the
 * current pace, not a forecast.
 */
export function Pacing({
  m,
  daily,
}: {
  m: Metrics;
  daily: { date: string; spend: number; leads: number; registrations: number; cpl: number | null }[];
}) {
  const active = daily.filter((d) => d.spend > 0);
  if (!active.length) return null;

  const byCpl = active.filter((d) => d.cpl != null).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0));
  const best = byCpl[0];
  const worst = byCpl[byCpl.length - 1];

  const perDay = m.dailySpend ?? 0;
  const leadsPerDay = m.days ? m.leads / m.days : 0;
  const regsPerDay = m.days ? m.registrations / m.days : 0;

  return (
    <div className="card p-4">
      <div className="text-[13px] font-semibold tracking-tight mb-0.5">Ritmo y proyección</div>
      <div className="text-[11px] text-[var(--text-muted)] mb-4">
        Aritmética sobre el ritmo actual en {m.days} {m.days === 1 ? "día" : "días"}. No es un
        pronóstico: es lo que saldría si nada cambia.
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Projected label="Inversión / 30 días" value={fmtMoney(perDay * 30, 0)} sub={`${fmtMoney(perDay, 0)} al día`} />
        <Projected label="Registrados / 30 días" value={fmtNum(Math.round(regsPerDay * 30))} sub={`${fmtNum(regsPerDay, 1)} al día`} />
        <Projected label="Leads cual. / 30 días" value={fmtNum(Math.round(leadsPerDay * 30))} sub={`${fmtNum(leadsPerDay, 1)} al día`} />
      </div>

      {best && worst && best.date !== worst.date ? (
        <>
          <div className="gold-rule mb-3" />
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="eyebrow mb-1" style={{ color: "var(--status-good)" }}>Mejor día</div>
              <div className="font-semibold">{fmtDayShort(best.date)} · {fmtMoney(best.cpl)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {fmtNum(best.leads)} {leadWord(best.leads)} con {fmtMoney(best.spend, 0)}
              </div>
            </div>
            <div>
              <div className="eyebrow mb-1" style={{ color: "var(--status-serious)" }}>Peor día</div>
              <div className="font-semibold">{fmtDayShort(worst.date)} · {fmtMoney(worst.cpl)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {fmtNum(worst.leads)} {leadWord(worst.leads)} con {fmtMoney(worst.spend, 0)}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Projected({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow truncate mb-1">{label}</div>
      <div className="text-[18px] font-semibold tnum tracking-tight truncate">{value}</div>
      <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{sub}</div>
    </div>
  );
}

/** Flags a funnel that leaks between the click and the landing page. */
export function ArrivalWarning({ m }: { m: Metrics }) {
  if (m.linkClicks < 50 || m.landingArrivalRate == null || m.landingArrivalRate >= 0.6) return null;
  const lost = m.linkClicks - m.landingPageViews;
  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-2.5 text-[12px]">
        <span aria-hidden style={{ color: "var(--status-serious)" }}>▲</span>
        <span className="text-[var(--text-secondary)]">
          Solo llega a la landing el <strong>{fmtPct(m.landingArrivalRate, 0)}</strong> de quien hace
          clic ({fmtNum(m.landingPageViews)} de {fmtNum(m.linkClicks)}). Se pierden{" "}
          <strong>{fmtNum(lost)} clics</strong> pagados por el camino: suele ser el píxel sin
          disparar, la página lenta o un enlace roto. Revísalo antes de tocar creatividades.
        </span>
      </div>
    </div>
  );
}
