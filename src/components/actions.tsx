"use client";

import { useState } from "react";
import type { Recommendation, Severity } from "@/lib/recommendations";
import { cplTrend } from "@/lib/recommendations";
import { fmtMoney, fmtPct } from "@/lib/format";
import { SectionTitle } from "./ui";

const TONE: Record<Severity, { color: string; icon: string; label: string }> = {
  critical: { color: "var(--status-critical)", icon: "✕", label: "Urgente" },
  serious: { color: "var(--status-serious)", icon: "▲", label: "Importante" },
  warning: { color: "var(--status-warning)", icon: "▲", label: "Vigilar" },
  good: { color: "var(--status-good)", icon: "▲", label: "Oportunidad" },
};

/**
 * The "so what" of the whole dashboard. Every card is arithmetic on the figures
 * above it, ordered by severity, and always shows the numbers that forced the
 * conclusion — so it can be argued with rather than merely believed.
 */
export function ActionPlan({
  recommendations,
  trend,
}: {
  recommendations: Recommendation[];
  trend: ReturnType<typeof cplTrend>;
}) {
  const [open, setOpen] = useState<string | null>(recommendations[0]?.id ?? null);

  if (!recommendations.length && !trend) return null;

  return (
    <section>
      <SectionTitle
        eyebrow="Qué hacer"
        title="Plan de acción"
        right={
          <span className="text-[11px] text-[var(--text-muted)]">
            {recommendations.length} {recommendations.length === 1 ? "recomendación" : "recomendaciones"} · calculadas del dato
          </span>
        }
      />

      {trend && trend.direction !== "flat" ? (
        <div
          className="card p-3.5 mb-3"
          style={{ borderColor: trend.direction === "up" ? "var(--status-serious)" : "var(--status-good)" }}
        >
          <div className="flex items-start gap-2.5 text-[12px]">
            <span aria-hidden style={{ color: trend.direction === "up" ? "var(--status-serious)" : "var(--status-good)" }}>
              {trend.direction === "up" ? "↑" : "↓"}
            </span>
            <span className="text-[var(--text-secondary)]">
              Tu coste por lead {trend.direction === "up" ? "se está degradando" : "está mejorando"}:{" "}
              <strong>{fmtMoney(trend.recent)}</strong> en los últimos días frente a{" "}
              <strong>{fmtMoney(trend.earlier)}</strong> antes ({trend.change > 0 ? "+" : "−"}
              {fmtPct(Math.abs(trend.change), 0)}).{" "}
              {trend.direction === "up"
                ? "Es lo típico al escalar: revisa frecuencia y rota creatividades antes de seguir subiendo."
                : "Lo que estás haciendo funciona: sostén el ritmo antes de cambiar nada."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {recommendations.map((r) => {
          const tone = TONE[r.severity];
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="card overflow-hidden">
              <button
                className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-[var(--surface-2)]"
                onClick={() => setOpen(isOpen ? null : r.id)}
                aria-expanded={isOpen}
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                  style={{ color: tone.color, background: `color-mix(in srgb, ${tone.color} 12%, transparent)` }}
                >
                  <span aria-hidden>{tone.icon}</span>
                  {tone.label}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold tracking-tight">{r.title}</span>
                  {r.impact ? (
                    <span className="block text-[11px] mt-0.5" style={{ color: "var(--gold)" }}>
                      {r.impact}
                    </span>
                  ) : null}
                </span>

                <span aria-hidden className="shrink-0 text-[var(--text-muted)] text-[11px] mt-1">
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen ? (
                <div className="px-4 pb-4 pl-[104px]">
                  <div className="gold-rule mb-3" />
                  <div className="mb-2">
                    <div className="eyebrow mb-1">Por qué</div>
                    <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{r.evidence}</p>
                  </div>
                  <div>
                    <div className="eyebrow mb-1">Qué hacer</div>
                    <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{r.action}</p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!recommendations.length ? (
        <div className="card p-4 text-[12px] text-[var(--text-secondary)]">
          Ninguna regla ha saltado en esta ventana. No significa que todo esté perfecto: significa que
          nada cruza los umbrales que se pueden comprobar con los datos que hay. Para lectura de
          matices, usa el copiloto.
        </div>
      ) : null}
    </section>
  );
}
