import { computeMetrics, groupBy, type Slice } from "./metrics";
import type { AdRow, Metrics } from "./types";

/**
 * Deterministic, data-derived recommendations.
 *
 * This is not a second opinion to the AI copilot — it is the floor. Every rule
 * here is arithmetic on the numbers already on screen, so it is instant, free,
 * reproducible, and can always show the figures that triggered it. The copilot
 * handles judgement; this handles what is simply true.
 *
 * Every rule respects the same significance bar as the rest of the app: a slice
 * without enough traffic produces no verdict, only a note that it has no read.
 */

export const MIN_LINK_CLICKS = 50;
export const MIN_LEADS = 5;

export type Severity = "critical" | "serious" | "warning" | "good";

export interface Recommendation {
  id: string;
  severity: Severity;
  /** what to do, in the imperative */
  title: string;
  /** the figures that force the conclusion */
  evidence: string;
  /** the concrete next step */
  action: string;
  /** money or leads on the table, when it can be estimated honestly */
  impact?: string;
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: n < 10 ? 2 : 0,
  }).format(n);

const pct = (n: number, d = 0) =>
  new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: d }).format(n);

const num = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);

/** Slices with enough traffic for their rates to mean anything. */
const significant = (s: Slice) =>
  s.metrics.linkClicks >= MIN_LINK_CLICKS || s.metrics.leads >= MIN_LEADS;

export function buildRecommendations(rows: AdRow[], currency = "USD"): Recommendation[] {
  const account = computeMetrics(rows);
  if (!rows.length || !account.spend) return [];

  const ads = groupBy(rows, "adName");
  const adsets = groupBy(rows, "adset");
  const out: Recommendation[] = [];
  const m = (n: number) => money(n, currency);

  /* --- 1. Traffic paid for that produced nothing ------------------------ */
  const dead = ads
    .filter((a) => a.metrics.leads === 0 && a.metrics.linkClicks >= MIN_LINK_CLICKS)
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  if (dead.length) {
    const wasted = dead.reduce((s, a) => s + a.metrics.spend, 0);
    // What that budget would have produced at the account's own efficiency —
    // the account's rate, not an optimistic one.
    const wouldHaveMade = account.cpl ? Math.floor(wasted / account.cpl) : null;
    out.push({
      id: "dead-ads",
      severity: "critical",
      title: dead.length === 1 ? `Apaga «${dead[0].key}»` : `Apaga ${dead.length} anuncios sin un solo lead`,
      evidence: dead
        .slice(0, 3)
        .map((a) => `${a.key}: ${m(a.metrics.spend)} y ${num(a.metrics.linkClicks)} clics en enlace, 0 leads`)
        .join(" · "),
      action:
        "Tuvieron tráfico de sobra para convertir y no lo hicieron. Páralos y reparte ese presupuesto entre los que sí convierten.",
      impact:
        wouldHaveMade && wouldHaveMade > 0
          ? `${m(wasted)} recuperables ≈ ${wouldHaveMade} leads al CPL medio de la cuenta`
          : `${m(wasted)} recuperables`,
    });
  }

  /* --- 2. The winner worth more budget --------------------------------- */
  const scored = ads.filter((a) => a.metrics.leads >= MIN_LEADS && a.metrics.cpl != null);
  const best = [...scored].sort((a, b) => a.metrics.cpl! - b.metrics.cpl!)[0];

  if (best && account.cpl && best.metrics.cpl! < account.cpl * 0.75) {
    const share = best.metrics.spend / account.spend;
    const cheaper = 1 - best.metrics.cpl! / account.cpl;
    out.push({
      id: "scale-best",
      severity: "good",
      title: `Sube presupuesto a «${best.key}»`,
      evidence: `CPL ${m(best.metrics.cpl!)} frente a ${m(account.cpl)} de la cuenta (${pct(cheaper)} más barato), con ${num(best.metrics.leads)} leads. Solo se lleva el ${pct(share)} del gasto.`,
      action:
        share < 0.35
          ? "Súbelo en incrementos del 20-25 % cada 48 h y vigila que el CPL aguante al escalar; suele degradarse."
          : "Ya concentra buena parte del gasto: sigue subiendo despacio y prepara variaciones para no depender de un solo creativo.",
      impact: account.cpl
        ? `Cada ${m(account.cpl)} movidos aquí rinden ~${(account.cpl / best.metrics.cpl!).toFixed(1)}× más leads`
        : undefined,
    });
  }

  /* --- 3. The funnel leaks before the landing page ---------------------- */
  if (account.linkClicks >= MIN_LINK_CLICKS && account.landingArrivalRate != null && account.landingArrivalRate < 0.7) {
    const lost = account.linkClicks - account.landingPageViews;
    const wasted = account.costPerLinkClick ? lost * account.costPerLinkClick : null;
    out.push({
      id: "landing-leak",
      severity: account.landingArrivalRate < 0.5 ? "critical" : "serious",
      title: "Arregla la fuga entre el clic y la landing",
      evidence: `Solo llega el ${pct(account.landingArrivalRate)} de los clics en enlace: ${num(account.landingPageViews)} vistas de ${num(account.linkClicks)} clics.`,
      action:
        "Comprueba en este orden: que el píxel de vista de landing dispare, la velocidad de carga en móvil y que el enlace del anuncio no redirija mal. Es lo más barato de arreglar de toda la cuenta.",
      impact: wasted ? `${m(wasted)} en clics que no llegan a ningún sitio` : `${num(lost)} clics perdidos`,
    });
  }

  /* --- 4. Audience saturation ------------------------------------------ */
  if (account.frequency != null && account.frequency > 2.5 && account.impressions > 5000) {
    out.push({
      id: "frequency",
      severity: account.frequency > 4 ? "serious" : "warning",
      title: "El público se está quemando",
      evidence: `Frecuencia ${account.frequency.toFixed(2)}: cada persona ha visto los anuncios más de ${Math.floor(account.frequency)} veces (${num(account.reach)} personas, ${num(account.impressions)} impresiones).`,
      action: "Amplía el público, añade exclusiones de quien ya convirtió, o rota creatividades antes de que el CPM suba más.",
    });
  }

  /* --- 5. Volume that does not qualify ---------------------------------- */
  if (account.qualificationRate != null) {
    const poor = ads
      .filter(significant)
      .filter(
        (a) =>
          a.metrics.registrations >= 10 &&
          a.metrics.qualificationRate != null &&
          a.metrics.qualificationRate < account.qualificationRate! * 0.75,
      )
      .sort((a, b) => b.metrics.registrations - a.metrics.registrations);

    if (poor.length) {
      const a = poor[0];
      out.push({
        id: "low-quality",
        severity: "warning",
        title: `«${a.key}» trae volumen pero no calidad`,
        evidence: `Solo cualifica el ${pct(a.metrics.qualificationRate!)} de sus ${num(a.metrics.registrations)} registrados, frente al ${pct(account.qualificationRate)} de la cuenta.`,
        action:
          "No es un problema de coste sino de promesa: el anuncio atrae al público equivocado. Endurece el gancho para que filtre antes de que se registren.",
      });
    }
  }

  /* --- 6. Everything riding on one creative ----------------------------- */
  const top = ads[0];
  if (top && ads.length > 2 && top.metrics.spend / account.spend > 0.45) {
    out.push({
      id: "concentration",
      severity: "warning",
      title: "Demasiado dinero en un solo anuncio",
      evidence: `«${top.key}» concentra el ${pct(top.metrics.spend / account.spend)} del gasto (${m(top.metrics.spend)} de ${m(account.spend)}).`,
      action:
        "Si se satura o Meta deja de entregarlo, la cuenta entera lo nota. Prepara dos variantes suyas para tener a dónde mover el presupuesto.",
    });
  }

  /* --- 7. Ad sets spending with nothing to show ------------------------- */
  const deadSets = adsets.filter(
    (s) => s.metrics.leads === 0 && s.metrics.registrations === 0 && s.metrics.spend > (account.dailySpend ?? 0) * 0.5,
  );
  if (deadSets.length && !dead.length) {
    const wasted = deadSets.reduce((s, a) => s + a.metrics.spend, 0);
    out.push({
      id: "dead-adsets",
      severity: "serious",
      title: `${deadSets.length} ${deadSets.length === 1 ? "conjunto" : "conjuntos"} sin ninguna conversión`,
      evidence: deadSets
        .slice(0, 3)
        .map((s) => `${s.key}: ${m(s.metrics.spend)}, ${num(s.metrics.linkClicks)} clics`)
        .join(" · "),
      action: "Revisa segmentación y ubicaciones antes de seguir invirtiendo ahí.",
      impact: `${m(wasted)} sin retorno`,
    });
  }

  return out.sort((a, b) => weight(b.severity) - weight(a.severity));
}

const weight = (s: Severity) => ({ critical: 4, serious: 3, warning: 2, good: 1 })[s];

/**
 * Is the CPL drifting? Compares the most recent third of the window against the
 * rest. Needs at least six days — below that a single bad day dominates and the
 * "trend" is noise.
 */
export function cplTrend(
  daily: { date: string; spend: number; leads: number }[],
): { direction: "up" | "down" | "flat"; recent: number; earlier: number; change: number } | null {
  const active = daily.filter((d) => d.spend > 0);
  if (active.length < 6) return null;

  const cut = Math.max(2, Math.floor(active.length / 3));
  const recentDays = active.slice(-cut);
  const earlierDays = active.slice(0, -cut);

  const cpl = (ds: typeof active) => {
    const spend = ds.reduce((s, d) => s + d.spend, 0);
    const leads = ds.reduce((s, d) => s + d.leads, 0);
    return leads > 0 ? spend / leads : null;
  };

  const recent = cpl(recentDays);
  const earlier = cpl(earlierDays);
  if (recent == null || earlier == null) return null;

  const change = recent / earlier - 1;
  return {
    direction: Math.abs(change) < 0.1 ? "flat" : change > 0 ? "up" : "down",
    recent,
    earlier,
    change,
  };
}

export type { Metrics };
