import type { AdRow } from "./types";

/**
 * What a campaign is actually trying to do, independent of whether it happens
 * to produce a lead. This exists because the recommendation engine was flagging
 * "1. THRUPLAYS" (a video-views campaign) and "2. FOLLOWMEADS" (a traffic
 * campaign) as "0 leads — turn it off" — judging them against a goal they were
 * never aimed at. A ThruPlay ad succeeding at getting watched is not failure.
 */
export type CampaignKind = "leads" | "awareness" | "traffic" | "engagement" | "sales" | "other";

export const KIND_LABEL: Record<CampaignKind, string> = {
  leads: "Generación de leads",
  awareness: "Notoriedad / ThruPlay",
  traffic: "Tráfico",
  engagement: "Interacción / seguidores",
  sales: "Ventas",
  other: "Otro objetivo",
};

/** Only this kind is judged by lead/CPL metrics — everything else gets a neutral read. */
export const isLeadGen = (kind: CampaignKind): boolean => kind === "leads";

// Meta's `objective` field is the authoritative signal — it's what Meta itself
// optimised delivery for. Current (OUTCOME_*) and legacy names both appear
// depending on when the campaign was created, so both are mapped.
const OBJECTIVE_MAP: Record<string, CampaignKind> = {
  OUTCOME_LEADS: "leads",
  LEAD_GENERATION: "leads",

  OUTCOME_AWARENESS: "awareness",
  BRAND_AWARENESS: "awareness",
  REACH: "awareness",
  VIDEO_VIEWS: "awareness",
  THRUPLAY: "awareness",

  OUTCOME_TRAFFIC: "traffic",
  LINK_CLICKS: "traffic",
  TRAFFIC: "traffic",

  OUTCOME_ENGAGEMENT: "engagement",
  POST_ENGAGEMENT: "engagement",
  PAGE_LIKES: "engagement",
  EVENT_RESPONSES: "engagement",
  MESSAGES: "engagement",

  OUTCOME_SALES: "sales",
  CONVERSIONS: "sales",
  PRODUCT_CATALOG_SALES: "sales",

  OUTCOME_APP_PROMOTION: "other",
  APP_INSTALLS: "other",
};

/**
 * Keyword fallback for when `objective` is blank — a degraded Windsor batch —
 * or holds a value this map doesn't recognise yet. Matched against campaign,
 * ad set, and ad name together, in Spanish and English since this account
 * mixes both.
 */
const NAME_PATTERNS: [RegExp, CampaignKind][] = [
  [/thru\s*-?\s*play|video\s*view|reconocimiento|notoriedad/i, "awareness"],
  [/follow\s*-?\s*me|followme|seguidores|page\s*like/i, "engagement"],
  [/tr[aá]fico|traffic|link\s*click/i, "traffic"],
  [/venta|sales|checkout|purchase/i, "sales"],
  [/\blead(s)?\b|registro|wsp|webinar/i, "leads"],
];

function classifyByName(...names: (string | undefined)[]): CampaignKind | null {
  const text = names.filter(Boolean).join(" ");
  for (const [re, kind] of NAME_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

/**
 * Objective wins when present and recognised. Name matching is the fallback —
 * for missing objective data, or a Meta objective string this map doesn't
 * cover yet — never an override of a known objective.
 */
export function classifyCampaign(
  row: Pick<AdRow, "campaign" | "adset" | "adName" | "objective">,
): CampaignKind {
  const key = (row.objective || "").trim().toUpperCase();
  const mapped = OBJECTIVE_MAP[key];
  if (mapped) return mapped;

  const byName = classifyByName(row.campaign, row.adset, row.adName);
  if (byName) return byName;

  // Nothing to go on: default to lead-gen so a Windsor outage — which already
  // surfaces its own "partial data" banner — doesn't silently exempt every ad
  // from its usual verdicts. An unrecognised-but-present objective defaults to
  // "other" instead, since we know for a fact it isn't OUTCOME_LEADS.
  return key ? "other" : "leads";
}

/** The dominant kind of a group of rows, by spend — for campaign/ad-set/ad-level slices. */
export function classifySlice(rows: AdRow[]): CampaignKind {
  const spend = new Map<CampaignKind, number>();
  for (const r of rows) {
    const k = classifyCampaign(r);
    spend.set(k, (spend.get(k) ?? 0) + r.spend);
  }
  let best: CampaignKind = "leads";
  let bestSpend = -1;
  for (const [k, s] of spend) {
    if (s > bestSpend) { best = k; bestSpend = s; }
  }
  return best;
}

export function splitByLeadGen(rows: AdRow[]): { leadGen: AdRow[]; other: AdRow[] } {
  const leadGen: AdRow[] = [];
  const other: AdRow[] = [];
  for (const r of rows) {
    (isLeadGen(classifyCampaign(r)) ? leadGen : other).push(r);
  }
  return { leadGen, other };
}
