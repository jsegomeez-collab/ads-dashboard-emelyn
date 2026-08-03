"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdRow, DateRange, RangeId, Store } from "@/lib/types";
import { computeMetrics, dailySeries, filterRows, groupBy } from "@/lib/metrics";
import { describeRange, describeWindow, localISO, RANGES, resolveRange, shiftDays } from "@/lib/ranges";
import { fmtDateLong, fmtMoney, fmtNum, fmtPct, getCurrency, setCurrency } from "@/lib/format";
import { AdScatter, CplByAdChart, CplTrendChart, FunnelChart, LeadsChart, QualityChart, SpendByChart, SpendChart } from "./charts";
import { Card, Empty, SectionTitle, Skeleton, ThemeToggle } from "./ui";
import { deltaOf, KpiTile, type Direction } from "./kpi";
import { ArrivalWarning, CostLadder, MetricStrip, Pacing } from "./insights";
import { ActionPlan } from "./actions";
import { buildRecommendations, cplTrend, MIN_LEADS, MIN_LINK_CLICKS } from "@/lib/recommendations";
import { splitByLeadGen } from "@/lib/objective";
import AdTable from "./AdTable";
import LaunchPanel from "./LaunchPanel";
import CreativeLab from "./CreativeLab";
import Copilot from "./Copilot";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "anuncios", label: "Anuncios" },
  { id: "lanzamientos", label: "Lanzamientos" },
  { id: "creativos", label: "Creativos" },
  { id: "copiloto", label: "Copiloto IA" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export interface PreviousPeriod {
  window: { from: string; to: string };
  /** whole account — used for the spend/impressions/clicks tiles */
  metrics: ReturnType<typeof computeMetrics>;
  /** lead-gen campaigns only — used for every metric downstream of registrations */
  leadMetrics: ReturnType<typeof computeMetrics>;
}

interface SyncState {
  at: string;
  rows: number;
  spend: number;
  fresh: boolean;
  source?: "meta" | "windsor";
  liveAvailable?: boolean;
  liveError?: string;
}

export default function Dashboard({ aiConfigured }: { aiConfigured: boolean }) {
  const [range, setRange] = useState<DateRange>({ id: "last_30d" });
  const [rows, setRows] = useState<AdRow[] | null>(null);
  const [degraded, setDegraded] = useState<string[]>([]);
  const [clampedTo, setClampedTo] = useState<string | null>(null);
  const [previous, setPrevious] = useState<PreviousPeriod | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [tab, setTab] = useState<TabId>("resumen");
  const [campaign, setCampaign] = useState<string>("");
  const [prefillAd, setPrefillAd] = useState<string | null>(null);
  const [currency, setCurrencyState] = useState<string>(getCurrency());

  /**
   * Guards against out-of-order responses. Picking a start date then an end
   * date fires two fetches; if the first is slower it would land last and
   * repaint the KPIs with the previous window while the label already shows the
   * new one — correct-looking numbers for the wrong dates.
   */
  const reqId = useRef(0);

  const load = useCallback(async (r: DateRange, refresh = false) => {
    const mine = ++reqId.current;
    if (refresh) setSyncing(true);
    else setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ range: r.id });
      if (r.from) q.set("from", r.from);
      if (r.to) q.set("to", r.to);
      if (refresh) q.set("refresh", "1");

      const res = await fetch(`/api/metrics?${q}`);
      const json = await res.json();
      if (mine !== reqId.current) return; // a newer window is already in flight
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la cuenta");

      // Label money with what the account actually bills in, not an assumption.
      if (json.currency && json.currency !== getCurrency()) {
        setCurrency(json.currency);
        setCurrencyState(json.currency);
      }

      const list = json.rows as AdRow[];
      setRows(list);
      setDegraded(json.degraded ?? []);
      setClampedTo(json.clampedTo ?? null);
      setSync({
        at: json.fetchedAt ?? new Date().toISOString(),
        rows: list.length,
        spend: list.reduce((a, x) => a + x.spend, 0),
        fresh: refresh,
        source: json.source,
        liveAvailable: json.liveAvailable,
        liveError: json.liveError,
      });
    } catch (e) {
      if (mine !== reqId.current) return;
      setError(e instanceof Error ? e.message : "Error desconocido");
      setRows([]);
    } finally {
      if (mine === reqId.current) {
        setLoading(false);
        setSyncing(false);
      }
    }

    // Deltas arrive a beat later and slot in; nothing above waits on them.
    setPrevious(null);
    try {
      const pq = new URLSearchParams({ range: r.id, window: "previous" });
      if (r.from) pq.set("from", r.from);
      if (r.to) pq.set("to", r.to);
      if (refresh) pq.set("refresh", "1");
      const pres = await fetch(`/api/metrics?${pq}`);
      if (mine !== reqId.current) return;
      if (pres.ok) setPrevious(await pres.json());
    } catch {
      /* no comparison is a missing nicety, not an error worth surfacing */
    }
  }, []);

  // Keyed on the resolved window, so typing in a custom date field doesn't fire
  // a request per keystroke — only a genuinely different window refetches.
  const rangeKey = `${range.id}|${range.from ?? ""}|${range.to ?? ""}`;
  useEffect(() => {
    void load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, load]);

  useEffect(() => {
    void fetch("/api/store")
      .then((r) => r.json())
      .then((s: Store) => { setStore(s); })
      .catch(() => setStore(null));
  }, []);

  const pickRange = (id: RangeId) => {
    if (id !== "custom") return setRange({ id });
    const to = localISO();
    setRange(resolveRange({ id: "custom", from: shiftDays(to, -6), to }));
  };

  const all = rows ?? [];
  const campaigns = useMemo(() => [...new Set(all.map((r) => r.campaign))].sort(), [all]);
  const scoped = useMemo(
    () => (campaign ? filterRows(all, { campaigns: [campaign] }) : all),
    [all, campaign],
  );
  const metrics = useMemo(() => computeMetrics(scoped), [scoped]);
  const daily = useMemo(() => dailySeries(scoped), [scoped]);
  const byCampaign = useMemo(() => groupBy(scoped, "campaign"), [scoped]);
  const byAdset = useMemo(() => groupBy(scoped, "adset"), [scoped]);
  const byAd = useMemo(() => groupBy(scoped, "adName"), [scoped]);
  const adNames = useMemo(() => byAd.map((a) => a.key), [byAd]);

  const openCreative = (adName: string) => { setPrefillAd(adName); setTab("creativos"); };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--plane) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1400px] mx-auto px-5 sm:px-7 pt-5 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="wordmark text-[11px] font-semibold" style={{ color: "var(--gold)" }}>AURUM</div>
              <h1 className="text-[19px] font-semibold tracking-tight mt-0.5 truncate">
                {all[0]?.accountName ?? "Centro de mando Meta Ads"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <SyncButton syncing={syncing} sync={sync} onSync={() => void load(range, true)} />
              <ThemeToggle />
            </div>
          </div>

          <div className="gold-rule mt-3 mb-3" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  className="chip"
                  data-on={range.id === r.id}
                  onClick={() => pickRange(r.id)}
                  title={r.hint}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {range.id === "custom" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  className="field !w-auto text-[12px] py-1.5"
                  type="date"
                  max={localISO()}
                  value={range.from ?? ""}
                  onChange={(e) => setRange((r) => resolveRange({ ...r, id: "custom", from: e.target.value }))}
                  aria-label="Fecha de inicio"
                />
                <span className="text-[12px] text-[var(--text-muted)]" aria-hidden>→</span>
                <input
                  className="field !w-auto text-[12px] py-1.5"
                  type="date"
                  max={localISO()}
                  value={range.to ?? ""}
                  onChange={(e) => setRange((r) => resolveRange({ ...r, id: "custom", to: e.target.value }))}
                  aria-label="Fecha de fin"
                />
              </div>
            ) : null}

            {campaigns.length > 1 ? (
              <select
                className="field !w-auto max-w-[240px] text-[12px] py-1.5"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                aria-label="Filtrar por campaña"
              >
                <option value="">Todas las campañas</option>
                {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : null}
          </div>

          <nav className="flex flex-wrap items-center gap-1 mt-3 -mb-px" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: `2px solid ${tab === t.id ? "var(--gold)" : "transparent"}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ height: 1, background: "var(--hairline)" }} />
      </header>

      <main className="max-w-[1400px] mx-auto px-5 sm:px-7 py-6 space-y-6">
        {error ? (
          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <span aria-hidden style={{ color: "var(--status-critical)" }}>✕</span>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: "var(--status-critical)" }}>Error al cargar</div>
                <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">{error}</div>
              </div>
            </div>
          </Card>
        ) : null}

        {sync?.liveError ? (
          <Card className="p-3.5">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--status-warning)" }}>▲</span>
              <span className="text-[var(--text-secondary)]">
                No se pudo leer de Meta en vivo, se muestran los datos de Windsor. {sync.liveError}
              </span>
            </div>
          </Card>
        ) : null}

        {degraded.length ? (
          <Card className="p-3.5">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--status-warning)" }}>▲</span>
              <span className="text-[var(--text-secondary)]">
                Datos parciales: {degraded.length} de 3 bloques de campos no respondieron. Las métricas de esos
                campos aparecen a cero, no son reales.
              </span>
            </div>
          </Card>
        ) : null}

        {clampedTo ? (
          <Card className="p-3.5">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--status-warning)" }}>▲</span>
              <span className="text-[var(--text-secondary)]">
                Windsor todavía no tiene datos posteriores al <strong>{clampedTo}</strong> — su
                calendario va por el huso horario de la cuenta, no por el tuyo. Se muestra hasta ese día.
              </span>
            </div>
          </Card>
        ) : null}

        {range.id === "today" && !clampedTo && rows?.length ? (
          <Card className="p-3.5">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--gold)" }}>◷</span>
              <span className="text-[var(--text-secondary)]">
                Día en curso: los datos siguen entrando y Meta tarda en consolidar conversiones. No compares
                este CPL con el de días ya cerrados.
              </span>
            </div>
          </Card>
        ) : null}

        {loading && !rows ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}
          </div>
        ) : null}

        {tab === "resumen" && rows ? (
          <Overview rows={scoped} metrics={metrics} previous={previous} daily={daily} byCampaign={byCampaign} byAdset={byAdset} range={range} currency={currency} />
        ) : null}

        {tab === "anuncios" && rows ? (
          <AdTable rows={scoped} store={store} onAnalyse={openCreative} />
        ) : null}

        {tab === "lanzamientos" && rows ? (
          <LaunchPanel rows={all} store={store} setStore={setStore} campaigns={campaigns} />
        ) : null}

        {tab === "creativos" ? (
          <CreativeLab
            store={store}
            setStore={setStore}
            adNames={adNames}
            range={range}
            prefillAd={prefillAd}
            aiConfigured={aiConfigured}
          />
        ) : null}

        {tab === "copiloto" ? (
          <Copilot store={store} setStore={setStore} range={range} aiConfigured={aiConfigured} />
        ) : null}
      </main>

      <footer className="max-w-[1400px] mx-auto px-5 sm:px-7 pb-8 pt-2">
        <div className="gold-rule mb-3" />
        <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap gap-x-4 gap-y-1">
          <span>Datos vía Windsor.ai · Meta Ads</span>
          <span>Divisa: {currency} (según la cuenta publicitaria)</span>
          <span>Ventana: {describeRange(range)}</span>
          {sync ? <span>Última lectura: {fmtDateLong(sync.at)}</span> : null}
          <span>Los ratios se derivan de sumas, no de medias de fila.</span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------- sync -- */

/** Relative time that stays readable without a ticking clock. */
function agoLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/**
 * Pulls straight from Windsor with the server cache bypassed, so it reflects
 * what the Ads Manager holds right now rather than the copy we already had.
 */
function SyncButton({
  syncing,
  sync,
  onSync,
}: {
  syncing: boolean;
  sync: SyncState | null;
  onSync: () => void;
}) {
  const [justDone, setJustDone] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!sync?.fresh) return;
    setJustDone(true);
    const t = setTimeout(() => setJustDone(false), 4000);
    return () => clearTimeout(t);
  }, [sync?.at, sync?.fresh]);

  // Keeps "hace X min" honest while the page sits open.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2.5">
      {sync ? (
        <div className="text-right hidden sm:block leading-tight">
          <div className="text-[11px] text-[var(--text-secondary)] tnum">
            {fmtNum(sync.rows)} filas · {fmtMoney(sync.spend, 0)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {justDone && sync.source === "meta" ? (
              <span style={{ color: "var(--delta-up)" }}>✓ En vivo desde Meta</span>
            ) : justDone ? (
              <span style={{ color: "var(--delta-up)" }}>✓ Actualizado vía Windsor</span>
            ) : (
              `Leído ${agoLabel(sync.at)}${sync.source === "meta" ? " · Meta en vivo" : ""}`
            )}
          </div>
        </div>
      ) : null}
      <button
        className="btn btn-gold"
        onClick={onSync}
        disabled={syncing}
        title={
          sync?.liveAvailable === false
            ? "Vuelve a pedir los datos a Windsor saltándose la caché. Para leer de Meta en vivo, añade META_ACCESS_TOKEN en .env.local"
            : "Consulta la Marketing API de Meta en directo, sin pasar por la caché ni por el ciclo de sincronización de Windsor"
        }
      >
        {syncing ? "Sincronizando…" : "↻ Sincronizar"}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- overview -- */

function Overview({
  rows,
  currency,
  metrics,
  previous,
  daily,
  byCampaign,
  byAdset,
  range,
}: {
  rows: AdRow[];
  currency: string;
  metrics: ReturnType<typeof computeMetrics>;
  previous: PreviousPeriod | null;
  daily: ReturnType<typeof dailySeries>;
  byCampaign: ReturnType<typeof groupBy>;
  byAdset: ReturnType<typeof groupBy>;
  range: DateRange;
}) {
  /**
   * Lead-gen campaigns only. A ThruPlay (video-views) or traffic/"follow me"
   * campaign cannot produce a lead by design — Meta never optimised delivery
   * for that — so every metric downstream of registrations (CPL, CPR,
   * qualification rate, the funnel, the CPL-by-ad chart, the recommendations)
   * is computed from this slice, never the whole account. Total spend and the
   * top-line media metrics (impressions, clicks, CPM) stay whole-account —
   * "how much did I spend, period" is still a fair question regardless of
   * objective. See objective.ts for the classifier and why this exists.
   */
  const { leadGen: leadRows, other: otherRows } = useMemo(() => splitByLeadGen(rows), [rows]);
  const leadMetrics = useMemo(() => computeMetrics(leadRows), [leadRows]);
  const dailyLead = useMemo(() => dailySeries(leadRows), [leadRows]);
  const byAdLead = useMemo(() => groupBy(leadRows, "adName"), [leadRows]);
  const nonLeadGenSpend = useMemo(() => otherRows.reduce((s, r) => s + r.spend, 0), [otherRows]);

  if (!metrics.days) {
    return (
      <Card>
        <Empty
          title={`Sin datos en ${describeRange(range).toLowerCase()}`}
          body={
            range.id === "today"
              ? "Todavía no ha entrado nada hoy. Meta tarda un rato en reportar el gasto del día en curso."
              : "No hay filas para este rango. Prueba con una ventana más amplia o comprueba que la cuenta tenga campañas activas."
          }
        />
      </Card>
    );
  }

  const dailyPoints = daily.map((d) => ({
    date: d.date,
    spend: d.spend,
    leads: d.leads,
    cpl: d.cpl,
    clicks: d.clicks,
    impressions: d.impressions,
    registrations: d.registrations,
  }));

  const dailyLeadPoints = dailyLead.map((d) => ({
    date: d.date,
    spend: d.spend,
    leads: d.leads,
    cpl: d.cpl,
    clicks: d.clicks,
    impressions: d.impressions,
    registrations: d.registrations,
  }));

  const prev = previous?.metrics ?? null;
  const prevLead = previous?.leadMetrics ?? null;
  const compareLabel = previous ? `vs ${describeWindow({ id: "custom", ...previous.window })}` : undefined;
  const d = <K extends keyof typeof metrics>(k: K) =>
    deltaOf(metrics[k] as number | null, (prev?.[k] ?? null) as number | null);
  const dLead = <K extends keyof typeof leadMetrics>(k: K) =>
    deltaOf(leadMetrics[k] as number | null, (prevLead?.[k] ?? null) as number | null);
  const spark = (pick: (x: (typeof dailyPoints)[number]) => number | null) => dailyPoints.map(pick);
  const sparkLead = (pick: (x: (typeof dailyLeadPoints)[number]) => number | null) => dailyLeadPoints.map(pick);

  const rank = (g: ReturnType<typeof groupBy>) =>
    g.map((s) => ({ key: s.key, spend: s.metrics.spend, leads: s.metrics.leads, cpl: s.metrics.cpl, ctr: s.metrics.ctr }));

  // The funnel is specifically the lead funnel end to end, so every step —
  // including impressions and clicks at the top — comes from lead-gen rows.
  // Mixing full-account impressions with lead-gen-only registrations would mean
  // the top of the chart and the bottom describe two different populations.
  const funnel = [
    { label: "Impresiones", value: leadMetrics.impressions, rate: null },
    { label: "Clics", value: leadMetrics.clicks, rate: leadMetrics.ctr },
    { label: "Clics en enlace", value: leadMetrics.linkClicks, rate: leadMetrics.clicks ? leadMetrics.linkClicks / leadMetrics.clicks : null },
    { label: "Vistas de landing", value: leadMetrics.landingPageViews, rate: leadMetrics.linkClicks ? leadMetrics.landingPageViews / leadMetrics.linkClicks : null },
    { label: "Registrados", value: leadMetrics.registrations, rate: leadMetrics.registrationRate },
    { label: "Leads cualificados", value: leadMetrics.leads, rate: leadMetrics.qualificationRate },
  ];

  // One day has no trend to draw — the daily charts would each be a single dot.
  const singleDay = metrics.days <= 1;
  const tile = (direction: Direction) => ({ direction, compareLabel });

  return (
    <>
      <section>
        <SectionTitle
          eyebrow="Rendimiento"
          title="Métricas principales"
          right={
            <span className="text-[11px] text-[var(--text-muted)]">
              {describeWindow(range)} · {metrics.days} {metrics.days === 1 ? "día" : "días"} con datos
            </span>
          }
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            featured
            label="Inversión"
            value={fmtMoney(metrics.spend, 0)}
            delta={d("spend")}
            {...tile("neutral")}
            spark={singleDay ? undefined : spark((x) => x.spend)}
            sub={singleDay ? "en el día" : `${fmtMoney(metrics.dailySpend, 0)} / día`}
          />
          <KpiTile
            label="Registrados"
            value={fmtNum(leadMetrics.registrations)}
            delta={dLead("registrations")}
            {...tile("up-good")}
            spark={singleDay ? undefined : sparkLead((x) => x.registrations)}
            sub={`${fmtMoney(leadMetrics.cpr)} por registrado · solo lead gen`}
          />
          <KpiTile
            featured
            label="Leads cualificados"
            value={fmtNum(leadMetrics.leads)}
            delta={dLead("leads")}
            {...tile("up-good")}
            spark={singleDay ? undefined : sparkLead((x) => x.leads)}
            sub={`${fmtPct(leadMetrics.qualificationRate, 0)} de los registrados · scoring > 3`}
          />
          <KpiTile
            featured
            label="Coste por lead total"
            value={fmtMoney(leadMetrics.cpr)}
            delta={dLead("cpr")}
            {...tile("down-good")}
            sub="gasto ÷ registrados · solo lead gen"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <KpiTile
            label="Impresiones"
            value={fmtNum(metrics.impressions)}
            delta={d("impressions")}
            {...tile("neutral")}
            spark={singleDay ? undefined : spark((x) => x.impressions)}
            sub={`CPM ${fmtMoney(metrics.cpm)} · toda la cuenta`}
          />
          <KpiTile
            label="Clics"
            value={fmtNum(metrics.clicks)}
            delta={d("clicks")}
            {...tile("up-good")}
            spark={singleDay ? undefined : spark((x) => x.clicks)}
            sub={`CTR ${fmtPct(metrics.ctr, 2)} · CPC ${fmtMoney(metrics.cpc)}`}
          />
          <KpiTile
            label="Coste por lead cualificado"
            value={fmtMoney(leadMetrics.cpl)}
            delta={dLead("cpl")}
            {...tile("down-good")}
            spark={singleDay ? undefined : sparkLead((x) => x.cpl)}
            sub={leadMetrics.leads ? "gasto ÷ leads cualificados" : "sin leads cualificados"}
          />
          <KpiTile
            label="Tasa de cualificación"
            value={fmtPct(leadMetrics.qualificationRate, 1)}
            delta={dLead("qualificationRate")}
            {...tile("up-good")}
            sub={`${fmtNum(leadMetrics.leads)} de ${fmtNum(leadMetrics.registrations)} registrados`}
          />
        </div>
      </section>

      {nonLeadGenSpend > 0 ? (
        <div className="text-[11px] text-[var(--text-muted)] -mt-2">
          Inversión e impresiones son de toda la cuenta. Registrados, leads, CPL y CPR son solo de
          campañas de generación de leads — {fmtMoney(nonLeadGenSpend, 0)} en otras campañas se
          detallan en «Qué hacer» más abajo, sin mezclarse en estas cifras.
        </div>
      ) : null}

      <ActionPlan
        recommendations={useMemo(() => buildRecommendations(rows, currency), [rows, currency])}
        trend={useMemo(() => cplTrend(dailyPoints), [dailyPoints])}
      />

      <MetricStrip
        items={[
          { label: "Alcance", value: fmtNum(metrics.reach), hint: "Personas únicas · toda la cuenta" },
          { label: "Frecuencia", value: fmtNum(metrics.frequency, 2), hint: "Impresiones por persona · toda la cuenta" },
          { label: "Clics únicos", value: fmtNum(metrics.uniqueClicks), hint: `CTR único ${fmtPct(metrics.uniqueCtr, 2)}` },
          { label: "Clics en enlace (leads)", value: fmtNum(leadMetrics.linkClicks), hint: `${fmtPct(leadMetrics.linkClickRate, 0)} de los clics de esas campañas` },
          { label: "Coste / clic enlace", value: fmtMoney(leadMetrics.costPerLinkClick), hint: "solo campañas de leads" },
          { label: "Vistas de landing", value: fmtNum(leadMetrics.landingPageViews), hint: `${fmtMoney(leadMetrics.costPerLandingPageView)} por vista · solo leads` },
          { label: "Llegada a landing", value: fmtPct(leadMetrics.landingArrivalRate, 0), hint: "Vistas ÷ clics en enlace · solo leads" },
          { label: "Registro por vista", value: fmtPct(leadMetrics.registrationRate, 1), hint: "Registrados ÷ vistas de landing" },
        ]}
      />

      <ArrivalWarning m={leadMetrics} />

      <Highlights byAd={byAdLead} account={leadMetrics} />

      <section>
        <SectionTitle eyebrow="Dónde se encarece" title="Coste paso a paso y ritmo" />
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <CostLadder m={leadMetrics} />
          <Pacing m={leadMetrics} daily={dailyLeadPoints} />
        </div>
      </section>

      {!singleDay ? (
        <section>
          <SectionTitle eyebrow="Evolución" title="Cómo se ha movido la cuenta" />
          <div className="grid lg:grid-cols-3 gap-3 items-start">
            <SpendChart data={dailyPoints} />
            <QualityChart
              data={dailyLeadPoints.map((d) => ({
                date: d.date,
                registrations: d.registrations,
                leads: d.leads,
                qualificationRate: d.registrations ? d.leads / d.registrations : null,
              }))}
            />
            <CplTrendChart data={dailyLeadPoints} />
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle
          eyebrow="Estructura"
          title="Dónde va el dinero"
          right={
            nonLeadGenSpend > 0 ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                incluye {fmtMoney(nonLeadGenSpend, 0)} fuera del embudo de leads
              </span>
            ) : undefined
          }
        />
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <SpendByChart title="Inversión por campaña" hint="Ordenado por gasto, toda la cuenta. La etiqueta es lo invertido." data={rank(byCampaign)} />
          <SpendByChart title="Inversión por conjunto" hint="Los 8 conjuntos con más gasto, toda la cuenta." data={rank(byAdset)} />
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Diagnóstico" title="Embudo y anuncios de generación de leads" />
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <CplByAdChart
            average={leadMetrics.cpl}
            data={byAdLead.map((a) => ({
              adName: a.key,
              cpl: a.metrics.cpl,
              leads: a.metrics.leads,
              spend: a.metrics.spend,
              thin: a.metrics.linkClicks < MIN_LINK_CLICKS && a.metrics.leads < MIN_LEADS,
            }))}
          />
          <FunnelChart stages={funnel} />
          <LeadsChart data={dailyLeadPoints} />
          <AdScatter
            data={byAdLead.map((a) => ({ adName: a.key, spend: a.metrics.spend, cpl: a.metrics.cpl, leads: a.metrics.leads }))}
            avgCpl={leadMetrics.cpl}
          />
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------- highlights -- */

/**
 * The three sentences you'd want if you only had ten seconds: what to scale,
 * what is burning money, and what has no read yet. Everything here is derived
 * from the same numbers as the table — this is a shortcut, not a second truth.
 */
function Highlights({
  byAd,
  account,
}: {
  byAd: ReturnType<typeof groupBy>;
  account: ReturnType<typeof computeMetrics>;
}) {
  const scored = byAd.filter((a) => a.metrics.leads >= MIN_LEADS);
  const best = [...scored].sort((a, b) => (a.metrics.cpl ?? 1e9) - (b.metrics.cpl ?? 1e9))[0];

  // Enough traffic to have produced a lead, and none did.
  const burning = byAd
    .filter((a) => a.metrics.leads === 0 && a.metrics.linkClicks >= MIN_LINK_CLICKS)
    .sort((a, b) => b.metrics.spend - a.metrics.spend);
  const wasted = burning.reduce((sum, a) => sum + a.metrics.spend, 0);

  const thin = byAd.filter(
    (a) => a.metrics.spend > 0 && a.metrics.leads < MIN_LEADS && a.metrics.linkClicks < MIN_LINK_CLICKS,
  );

  if (!best && !burning.length && !thin.length) return null;

  return (
    <section>
      <SectionTitle eyebrow="Lo que importa" title="Titulares de la cuenta" />
      <div className="grid md:grid-cols-3 gap-3 items-start">
        {best ? (
          <HighlightCard
            tone="good"
            icon="▲"
            kicker="Mejor rendimiento"
            title={best.key}
            metric={fmtMoney(best.metrics.cpl)}
            metricLabel="por lead"
            body={
              account.cpl && best.metrics.cpl
                ? `${fmtNum(best.metrics.leads)} leads con ${fmtMoney(best.metrics.spend, 0)}. Sale ${fmtPct(1 - best.metrics.cpl / account.cpl, 0)} más barato que la media de la cuenta.`
                : `${fmtNum(best.metrics.leads)} leads con ${fmtMoney(best.metrics.spend, 0)}.`
            }
          />
        ) : null}

        {burning.length ? (
          <HighlightCard
            tone="critical"
            icon="✕"
            kicker="Dinero sin retorno"
            title={burning.length === 1 ? burning[0].key : `${burning.length} anuncios sin un solo lead`}
            metric={fmtMoney(wasted, 0)}
            metricLabel={account.spend ? `${fmtPct(wasted / account.spend, 0)} del gasto` : "gastado"}
            body={`Con tráfico suficiente para haber convertido: ${burning
              .slice(0, 3)
              .map((a) => `${a.key} (${fmtNum(a.metrics.linkClicks)} clics)`)
              .join(", ")}.`}
          />
        ) : null}

        {thin.length ? (
          <HighlightCard
            tone="neutral"
            icon="○"
            kicker="Sin señal todavía"
            title={`${thin.length} ${thin.length === 1 ? "anuncio" : "anuncios"} sin muestra suficiente`}
            metric={fmtMoney(thin.reduce((s, a) => s + a.metrics.spend, 0), 0)}
            metricLabel="invertido"
            body={`Menos de ${MIN_LINK_CLICKS} clics en enlace y ${MIN_LEADS} leads. Su CPL aún no sirve para decidir: dales más presupuesto o más tiempo antes de juzgarlos.`}
          />
        ) : null}
      </div>
    </section>
  );
}

function HighlightCard({
  tone,
  icon,
  kicker,
  title,
  metric,
  metricLabel,
  body,
}: {
  tone: "good" | "critical" | "neutral";
  icon: string;
  kicker: string;
  title: string;
  metric: string;
  metricLabel: string;
  body: string;
}) {
  const color =
    tone === "good" ? "var(--status-good)" : tone === "critical" ? "var(--status-critical)" : "var(--text-muted)";

  return (
    <div className="card p-4 h-full">
      <div className="flex items-center gap-1.5 mb-2.5" style={{ color }}>
        <span aria-hidden className="text-[11px]">{icon}</span>
        <span className="eyebrow" style={{ color }}>{kicker}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="text-[14px] font-semibold tracking-tight truncate min-w-0" title={title}>{title}</div>
        <div className="text-right shrink-0">
          <div className="text-[17px] font-semibold tnum leading-none">{metric}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{metricLabel}</div>
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}
