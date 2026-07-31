import type { AdRow, Launch, LaunchMetrics, Metrics } from "./types";

/** Division that refuses to invent a number. `null` renders as "—", never as 0. */
export const div = (a: number, b: number): number | null =>
  b > 0 && Number.isFinite(a / b) ? a / b : null;

const EMPTY_SUMS = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  uniqueClicks: 0,
  linkClicks: 0,
  landingPageViews: 0,
  videoViews: 0,
  leads: 0,
  registrations: 0,
  purchases: 0,
  purchaseValue: 0,
};

/**
 * Every ratio is computed from summed counters, so it stays correct at any
 * aggregation level. (Averaging per-row CTRs would weight a 3-impression row
 * the same as a 30,000-impression one.)
 */
export function computeMetrics(rows: AdRow[]): Metrics {
  const s = { ...EMPTY_SUMS };
  const days = new Set<string>();

  for (const r of rows) {
    s.spend += r.spend;
    s.impressions += r.impressions;
    s.reach += r.reach;
    s.clicks += r.clicks;
    s.uniqueClicks += r.uniqueClicks;
    s.linkClicks += r.linkClicks;
    s.landingPageViews += r.landingPageViews;
    s.videoViews += r.videoViews;
    s.leads += r.leads;
    s.registrations += r.registrations;
    s.purchases += r.purchases;
    s.purchaseValue += r.purchaseValue;
    if (r.date) days.add(r.date);
  }

  const dayCount = days.size;

  return {
    ...s,
    days: dayCount,

    cpm: div(s.spend * 1000, s.impressions),
    cpc: div(s.spend, s.clicks),
    ctr: div(s.clicks, s.impressions),
    linkCtr: div(s.linkClicks, s.impressions),
    // Reach is de-duplicated per day by Meta, so summing it across days
    // over-counts people. Frequency is only meaningful on a single-day slice
    // or when the platform supplies reach for the whole window.
    frequency: div(s.impressions, s.reach),
    costPerLandingPageView: div(s.spend, s.landingPageViews),
    costPerLinkClick: div(s.spend, s.linkClicks),
    linkClickRate: div(s.linkClicks, s.clicks),
    landingArrivalRate: div(s.landingPageViews, s.linkClicks),
    uniqueCtr: div(s.uniqueClicks, s.reach),

    cpl: div(s.spend, s.leads),
    cpr: div(s.spend, s.registrations),
    leadRate: div(s.leads, s.linkClicks),
    clickToLeadRate: div(s.leads, s.clicks),
    // Registrations are the intake; qualified leads are the subset that scored
    // above 3. So the funnel runs LPV → registration → qualified lead, and this
    // ratio is the share of signups actually worth calling.
    qualificationRate: div(s.leads, s.registrations),
    registrationRate: div(s.registrations, s.landingPageViews),
    lpvToLeadRate: div(s.leads, s.landingPageViews),
    costPerPurchase: div(s.spend, s.purchases),
    platformRoas: div(s.purchaseValue, s.spend),
    dailySpend: div(s.spend, dayCount),
  };
}

export type Dimension = "campaign" | "adset" | "adName" | "date" | "objective";

export interface Slice {
  key: string;
  rows: AdRow[];
  metrics: Metrics;
}

export function groupBy(rows: AdRow[], dim: Dimension): Slice[] {
  const map = new Map<string, AdRow[]>();
  for (const r of rows) {
    const k = String(r[dim] ?? "");
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()]
    .map(([key, rs]) => ({ key, rows: rs, metrics: computeMetrics(rs) }))
    .sort((a, b) => b.metrics.spend - a.metrics.spend);
}

/** Daily series, gap-filled so the x axis has no invisible holes. */
export function dailySeries(rows: AdRow[]): Array<{ date: string } & Metrics> {
  const byDate = groupBy(rows, "date").sort((a, b) => a.key.localeCompare(b.key));
  if (!byDate.length) return [];

  const out: Array<{ date: string } & Metrics> = [];
  const first = new Date(byDate[0].key + "T00:00:00Z");
  const last = new Date(byDate[byDate.length - 1].key + "T00:00:00Z");
  const lookup = new Map(byDate.map((d) => [d.key, d.metrics]));

  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, ...(lookup.get(key) ?? computeMetrics([])) });
  }
  return out;
}

export function filterRows(
  rows: AdRow[],
  opts: { campaigns?: string[]; adsets?: string[]; from?: string; to?: string },
): AdRow[] {
  return rows.filter((r) => {
    if (opts.campaigns?.length && !opts.campaigns.includes(r.campaign)) return false;
    if (opts.adsets?.length && !opts.adsets.includes(r.adset)) return false;
    if (opts.from && r.date < opts.from) return false;
    if (opts.to && r.date > opts.to) return false;
    return true;
  });
}

/**
 * Fuse the automatic ad numbers with the hand-entered launch numbers.
 * This is where ROAS, CAC and profit actually become knowable — Meta only ever
 * sees the top of this funnel.
 */
export function computeLaunchMetrics(launch: Launch, allRows: AdRow[]): LaunchMetrics {
  const rows = filterRows(allRows, {
    campaigns: launch.campaigns,
    from: launch.startDate,
    to: launch.endDate,
  });
  const ads = computeMetrics(rows);

  const registrations =
    launch.registrationsManual != null && launch.registrationsManual > 0
      ? launch.registrationsManual
      : ads.registrations || ads.leads;

  const unitsSold = launch.tickets.reduce((a, t) => a + (t.units || 0), 0);
  const contractedRevenue = launch.tickets.reduce((a, t) => a + (t.units || 0) * (t.price || 0), 0);
  const extraCostTotal = launch.extraCosts.reduce((a, c) => a + (c.amount || 0), 0);
  const totalCost = ads.spend + extraCostTotal;
  const cash = launch.cashCollected || 0;

  return {
    ads,
    registrations,
    showUps: launch.showUps,
    stayedToOffer: launch.stayedToOffer,
    callsBooked: launch.callsBooked,
    callsTaken: launch.callsTaken,

    unitsSold,
    contractedRevenue,
    cashCollected: cash,
    extraCostTotal,
    totalCost,

    showUpRate: div(launch.showUps, registrations),
    stayRate: div(launch.stayedToOffer, launch.showUps),
    bookingRate: div(launch.callsBooked, launch.showUps),
    callShowRate: div(launch.callsTaken, launch.callsBooked),
    closeRate: div(unitsSold, launch.showUps),
    callCloseRate: div(unitsSold, launch.callsTaken),
    cashCollectionRate: div(cash, contractedRevenue),

    aov: div(contractedRevenue, unitsSold),
    cac: div(ads.spend, unitsSold),
    fullCac: div(totalCost, unitsSold),
    costPerShowUp: div(ads.spend, launch.showUps),
    costPerCall: div(ads.spend, launch.callsTaken),
    roas: div(contractedRevenue, ads.spend),
    cashRoas: div(cash, ads.spend),
    netRoas: div(cash, totalCost),
    profit: cash - totalCost,
    margin: div(cash - totalCost, cash),
    // What ROAS must clear for the launch to break even once non-ad costs are in.
    breakevenRoas: div(totalCost, ads.spend),
    earningsPerLead: div(cash, ads.leads),
    earningsPerShowUp: div(cash, launch.showUps),
  };
}

/**
 * Compare a slice against the account average so the UI can flag outliers.
 * Returns a signed multiple: +0.4 = 40% better than account average.
 */
export function relative(value: number | null, benchmark: number | null, lowerIsBetter = false): number | null {
  if (value == null || benchmark == null || benchmark === 0) return null;
  const ratio = value / benchmark - 1;
  return lowerIsBetter ? -ratio : ratio;
}

export type Verdict = "good" | "warning" | "serious" | "critical" | "neutral";

/** Traffic-light for a metric vs the account benchmark. Always shipped with a label. */
export function verdictFor(delta: number | null): Verdict {
  if (delta == null) return "neutral";
  if (delta >= 0.15) return "good";
  if (delta >= -0.15) return "neutral";
  if (delta >= -0.35) return "warning";
  if (delta >= -0.6) return "serious";
  return "critical";
}
