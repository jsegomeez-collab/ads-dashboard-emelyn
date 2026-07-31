import type { AdRow, DateRange } from "./types";
import { effectiveWindow } from "./ranges";

/**
 * Direct line to Meta's Marketing API.
 *
 * Windsor is a scheduled connector: it re-syncs from Meta on its own cadence and
 * exposes no way to force a pull (every refresh parameter is ignored, and
 * `force_refresh` is blocked outright). Its numbers do move — today's spend was
 * restated from 115.75 to 115.61 between two of our reads — but only when
 * Windsor decides.
 *
 * This path asks Meta itself, so "sync" means what it says. It is optional:
 * without a token the dashboard runs on Windsor exactly as before.
 */

const API_VERSION = process.env.META_API_VERSION || "v21.0";

export const metaConfigured = (): boolean =>
  Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);

/** `act_123…` — accepted with or without the prefix. */
function accountPath(): string {
  const raw = (process.env.META_AD_ACCOUNT_ID || "").trim();
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

/** Meta returns conversions as an untyped array of {action_type, value}. */
type Action = { action_type?: string; value?: string | number };

const actionValue = (actions: Action[] | undefined, ...types: string[]): number => {
  if (!actions?.length) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

interface InsightRow {
  date_start?: string;
  account_name?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  unique_clicks?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
}

const FIELDS = [
  "account_name",
  "campaign_name",
  "adset_name",
  "ad_name",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "unique_clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
].join(",");

export interface MetaResult {
  rows: AdRow[];
  fetchedAt: string;
}

/**
 * One row per ad per day, matching the shape Windsor produces so the rest of the
 * app cannot tell which source it is looking at.
 */
export async function fetchMetaRows(range: DateRange, signal?: AbortSignal): Promise<MetaResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN no está configurado");
  if (!process.env.META_AD_ACCOUNT_ID) throw new Error("META_AD_ACCOUNT_ID no está configurado");

  const { from, to } = effectiveWindow(range);
  const rows: AdRow[] = [];

  let url: string | null =
    `https://graph.facebook.com/${API_VERSION}/${accountPath()}/insights` +
    `?level=ad&time_increment=1&limit=500` +
    `&fields=${encodeURIComponent(FIELDS)}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}` +
    `&access_token=${encodeURIComponent(token)}`;

  // Meta paginates; a busy account easily exceeds one page. Bounded so a broken
  // cursor cannot spin forever.
  for (let page = 0; url && page < 25; page++) {
    const res: Response = await fetch(url, { signal, cache: "no-store" });
    const json = (await res.json()) as {
      data?: InsightRow[];
      paging?: { next?: string };
      error?: { message?: string; type?: string; code?: number };
    };

    if (json.error) {
      // Surface Meta's own wording — it names expired tokens and missing
      // permissions precisely, and guessing would only obscure it.
      throw new Error(`Meta API: ${json.error.message ?? "error desconocido"} (código ${json.error.code ?? "?"})`);
    }
    if (!res.ok) throw new Error(`Meta API respondió ${res.status}`);

    for (const r of json.data ?? []) {
      rows.push({
        date: (r.date_start ?? "").slice(0, 10),
        accountName: r.account_name ?? "",
        campaign: r.campaign_name || "(sin campaña)",
        adset: r.adset_name || "(sin conjunto)",
        adName: r.ad_name || "(sin anuncio)",
        objective: r.objective ?? "",
        campaignStatus: "",

        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
        uniqueClicks: num(r.unique_clicks),
        linkClicks: num(r.inline_link_clicks) || actionValue(r.actions, "link_click"),
        landingPageViews: actionValue(r.actions, "landing_page_view"),
        videoViews: actionValue(r.actions, "video_view"),
        // Same semantics as Windsor: `lead` is the qualified subset,
        // `complete_registration` is everyone who signed up.
        leads: actionValue(r.actions, "lead", "offsite_conversion.fb_pixel_lead"),
        registrations: actionValue(
          r.actions,
          "complete_registration",
          "offsite_conversion.fb_pixel_complete_registration",
        ),
        purchases: actionValue(r.actions, "purchase", "offsite_conversion.fb_pixel_purchase"),
        purchaseValue: actionValue(r.action_values, "purchase", "offsite_conversion.fb_pixel_purchase"),
      });
    }

    url = json.paging?.next ?? null;
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, fetchedAt: new Date().toISOString() };
}

/** Account currency, so live mode labels money the same way Windsor mode does. */
export async function fetchMetaCurrency(signal?: AbortSignal): Promise<string | undefined> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || !process.env.META_AD_ACCOUNT_ID) return undefined;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${accountPath()}?fields=currency&access_token=${encodeURIComponent(token)}`,
      { signal, cache: "no-store" },
    );
    const json = (await res.json()) as { currency?: string };
    return json.currency;
  } catch {
    return undefined;
  }
}
