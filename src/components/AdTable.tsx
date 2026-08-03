"use client";

import { useMemo, useState } from "react";
import type { AdRow, Metrics, Store } from "@/lib/types";
import { computeMetrics, groupBy, relative, verdictFor, type Dimension } from "@/lib/metrics";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
// One definition of "enough sample", shared by the table, the highlights and the rules.
import { MIN_LEADS, MIN_LINK_CLICKS } from "@/lib/recommendations";
import { classifyCampaign, classifySlice, isLeadGen, KIND_LABEL } from "@/lib/objective";
import { Card, Empty, SectionTitle, VerdictTag } from "./ui";

const LEVELS: { id: Dimension; label: string }[] = [
  { id: "campaign", label: "Campañas" },
  { id: "adset", label: "Conjuntos" },
  { id: "adName", label: "Anuncios" },
];

type KindFilter = "all" | "leads" | "other";
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "leads", label: "Solo lead gen" },
  { id: "other", label: "Solo otras" },
];

type SortKey = keyof Metrics | "key";

const COLUMNS: { key: SortKey; label: string; render: (m: Metrics) => string; lowerIsBetter?: boolean }[] = [
  { key: "spend", label: "Inversión", render: (m) => fmtMoney(m.spend, 0) },
  { key: "impressions", label: "Impr.", render: (m) => fmtNum(m.impressions) },
  { key: "clicks", label: "Clics", render: (m) => fmtNum(m.clicks) },
  { key: "ctr", label: "CTR", render: (m) => fmtPct(m.ctr, 2) },
  { key: "cpc", label: "CPC", render: (m) => fmtMoney(m.cpc), lowerIsBetter: true },
  { key: "cpm", label: "CPM", render: (m) => fmtMoney(m.cpm), lowerIsBetter: true },
  { key: "landingPageViews", label: "Landing", render: (m) => fmtNum(m.landingPageViews) },
  // Funnel order: registrations are the intake, qualified leads the subset.
  { key: "registrations", label: "Registrados", render: (m) => fmtNum(m.registrations) },
  { key: "cpr", label: "C/registrado", render: (m) => fmtMoney(m.cpr), lowerIsBetter: true },
  { key: "leads", label: "Leads cual.", render: (m) => fmtNum(m.leads) },
  { key: "cpl", label: "CPL cual.", render: (m) => fmtMoney(m.cpl), lowerIsBetter: true },
  { key: "qualificationRate", label: "% cualif.", render: (m) => fmtPct(m.qualificationRate, 0) },
];

export default function AdTable({
  rows,
  store,
  onAnalyse,
}: {
  rows: AdRow[];
  store: Store | null;
  onAnalyse: (adName: string) => void;
}) {
  const [level, setLevel] = useState<Dimension>("adName");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [asc, setAsc] = useState(false);

  /**
   * A ThruPlay (video-views) or traffic/"follow me" campaign cannot produce a
   * lead by design — Meta never optimised delivery for that — so it never gets
   * the "0 leads = critical" verdict or a poca-muestra warning: both are about
   * whether a lead-gen ad has enough sample, which is meaningless for an ad
   * that was never trying to produce one. See objective.ts.
   *
   * The CPL benchmark used for the "Señal" comparison always comes from the
   * full lead-gen set regardless of the filter below, so switching the view
   * doesn't quietly change what "average" means mid-comparison.
   */
  const leadGenBenchmark = useMemo(
    () => computeMetrics(rows.filter((r) => isLeadGen(classifyCampaign(r)))),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (kindFilter === "all") return rows;
    const wantLeadGen = kindFilter === "leads";
    return rows.filter((r) => isLeadGen(classifyCampaign(r)) === wantLeadGen);
  }, [rows, kindFilter]);

  const account = useMemo(() => computeMetrics(filteredRows), [filteredRows]);
  const groups = useMemo(() => groupBy(filteredRows, level), [filteredRows, level]);

  const sorted = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      if (sort === "key") return asc ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
      const av = a.metrics[sort] as number | null;
      const bv = b.metrics[sort] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last, whichever direction
      if (bv == null) return -1;
      return asc ? av - bv : bv - av;
    });
    return list;
  }, [groups, sort, asc]);

  const analysed = useMemo(
    () => new Set((store?.creatives ?? []).map((c) => c.adName)),
    [store],
  );

  const click = (k: SortKey) => {
    if (k === sort) setAsc((v) => !v);
    else { setSort(k); setAsc(false); }
  };

  if (!rows.length) {
    return <Card><Empty title="Sin datos" body="No hay filas para el rango y filtro seleccionados." /></Card>;
  }

  return (
    <section>
      <SectionTitle
        eyebrow="Detalle"
        title="Rendimiento fila a fila"
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS.map((l) => (
              <button key={l.id} className="chip" data-on={level === l.id} onClick={() => setLevel(l.id)}>
                {l.label}
              </button>
            ))}
            <span className="text-[var(--text-muted)]" aria-hidden>·</span>
            {KIND_FILTERS.map((f) => (
              <button key={f.id} className="chip" data-on={kindFilter === f.id} onClick={() => setKindFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
                <th
                  className="text-left py-2.5 px-3 font-medium text-[var(--text-muted)] cursor-pointer whitespace-nowrap sticky left-0"
                  style={{ background: "var(--surface-1)" }}
                  onClick={() => click("key")}
                >
                  Nombre {sort === "key" ? (asc ? "↑" : "↓") : ""}
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="text-right py-2.5 px-3 font-medium text-[var(--text-muted)] cursor-pointer whitespace-nowrap"
                    onClick={() => click(c.key)}
                  >
                    {c.label} {sort === c.key ? (asc ? "↑" : "↓") : ""}
                  </th>
                ))}
                <th className="text-right py-2.5 px-3 font-medium text-[var(--text-muted)] whitespace-nowrap">Señal</th>
                {level === "adName" ? <th className="py-2.5 px-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const m = g.metrics;
                const kind = classifySlice(g.rows);
                const rowIsLeadGen = isLeadGen(kind);
                const thin = m.linkClicks < MIN_LINK_CLICKS && m.leads < MIN_LEADS;
                const delta = relative(m.cpl, leadGenBenchmark.cpl, true);
                return (
                  <tr key={g.key} className="transition-colors hover:bg-[var(--surface-2)]" style={{ borderBottom: "1px solid var(--hairline)" }}>
                    <td
                      className="py-2.5 px-3 font-medium max-w-[220px] truncate sticky left-0"
                      style={{ background: "var(--surface-1)" }}
                      title={rowIsLeadGen ? g.key : `${g.key} · ${KIND_LABEL[kind]}`}
                    >
                      {g.key}
                      {!rowIsLeadGen ? (
                        <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">
                          · {KIND_LABEL[kind]}
                        </span>
                      ) : null}
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="text-right py-2.5 px-3 tnum whitespace-nowrap">
                        {c.render(m)}
                      </td>
                    ))}
                    <td className="text-right py-2.5 px-3 whitespace-nowrap">
                      {!rowIsLeadGen ? (
                        <span
                          className="text-[11px] text-[var(--text-muted)]"
                          title={`Objetivo «${KIND_LABEL[kind]}»: no está pensado para generar leads, así que no se juzga por CPL ni por leads.`}
                        >
                          ○ No es lead gen
                        </span>
                      ) : thin ? (
                        <span className="text-[11px] text-[var(--text-muted)]" title={`Solo ${fmtNum(m.linkClicks)} clics en enlace y ${fmtNum(m.leads)} leads cualificados: aún no hay señal fiable.`}>
                          ○ Poca muestra
                        </span>
                      ) : m.leads === 0 ? (
                        // Enough traffic to have produced a lead, and none came:
                        // that is the worst outcome on the table, not an average one.
                        <VerdictTag
                          verdict="critical"
                          detail={`0 leads cualificados con ${fmtMoney(m.spend, 0)}`}
                        />
                      ) : (
                        <VerdictTag
                          verdict={verdictFor(delta)}
                          detail={delta == null ? undefined : `CPL ${delta >= 0 ? "−" : "+"}${fmtPct(Math.abs(delta), 0)} vs media de leads`}
                        />
                      )}
                    </td>
                    {level === "adName" ? (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button className="chip" data-on={analysed.has(g.key)} onClick={() => onAnalyse(g.key)}>
                          {analysed.has(g.key) ? "✓ Analizado" : "Analizar"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--hairline-strong)" }}>
                <td className="py-2.5 px-3 font-semibold sticky left-0" style={{ background: "var(--surface-1)" }}>Total</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="text-right py-2.5 px-3 tnum font-semibold whitespace-nowrap">
                    {c.render(account)}
                  </td>
                ))}
                <td />
                {level === "adName" ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
        «Registrados» es todo el que se apuntó; «Leads cual.» son los que superan 3 de scoring. «Señal»
        compara el CPL cualificado de la fila con la media de las campañas de generación de leads —
        nunca con campañas de notoriedad, tráfico o interacción, que llevan su propia etiqueta neutral
        («No es lead gen») porque no están pensadas para producir leads. Dentro de las de leads, menos de{" "}
        {MIN_LINK_CLICKS} clics en enlace y {MIN_LEADS} leads cualificados se marca como poca muestra: su
        CPL todavía no es fiable para decidir.
      </p>
    </section>
  );
}
