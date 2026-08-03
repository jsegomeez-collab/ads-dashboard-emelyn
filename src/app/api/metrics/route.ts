import { NextResponse } from "next/server";
import { fetchAccountCurrency, getAdRows } from "@/lib/windsor";
import { fetchMetaCurrency, fetchMetaRows, metaConfigured } from "@/lib/meta";
import { isRangeId, previousWindow, resolveRange } from "@/lib/ranges";
import { computeMetrics } from "@/lib/metrics";
import { splitByLeadGen } from "@/lib/objective";
import type { DateRange } from "@/lib/types";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Read a range off the query string, rejecting anything malformed.
 *  Not exported — Next only allows route handlers and a fixed config set here. */
function rangeFromParams(params: URLSearchParams): DateRange {
  const raw = params.get("range") ?? params.get("preset") ?? "last_30d";
  const id = isRangeId(raw) ? raw : "last_30d";
  const from = params.get("from");
  const to = params.get("to");
  return resolveRange({
    id,
    from: from && ISO.test(from) ? from : undefined,
    to: to && ISO.test(to) ? to : undefined,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = rangeFromParams(searchParams);
  const force = searchParams.get("refresh") === "1";

  /**
   * The comparison window is a second trip to Windsor — three more batches, and
   * roughly a doubling of wall time. It is served as its own request so the KPIs
   * paint as soon as the current window lands and the deltas fill in after,
   * rather than the whole dashboard waiting on both.
   */
  const wantsPrevious = searchParams.get("window") === "previous";

  try {
    if (wantsPrevious) {
      const prev = previousWindow(range);
      const { rows } = await getAdRows({ id: "custom", from: prev.from, to: prev.to }, force);
      // Two variants: `metrics` (whole account — spend, impressions, clicks)
      // and `leadMetrics` (lead-gen campaigns only — everything downstream of
      // registrations). Mixing ThruPlay/traffic spend into the lead benchmark
      // is exactly the bug this endpoint used to have.
      const { leadGen } = splitByLeadGen(rows);
      return NextResponse.json({
        window: prev,
        metrics: computeMetrics(rows),
        leadMetrics: computeMetrics(leadGen),
      });
    }

    /**
     * "Sincronizar" means live when a Meta token is configured: Windsor cannot
     * be told to re-pull, so the only way to get the Ads Manager's current
     * numbers is to ask Meta directly. If that call fails we fall back to
     * Windsor rather than showing nothing, and say which source answered.
     */
    if (force && metaConfigured()) {
      try {
        const live = await fetchMetaRows(range);
        const currency = (await fetchMetaCurrency()) ?? (await fetchAccountCurrency());
        return NextResponse.json({
          rows: live.rows,
          degraded: [],
          fetchedAt: live.fetchedAt,
          range,
          currency,
          source: "meta",
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "error desconocido";
        const fb = await getAdRows(range, true);
        return NextResponse.json({
          rows: fb.rows,
          degraded: fb.degraded,
          fetchedAt: fb.fetchedAt,
          range,
          clampedTo: fb.clampedTo,
          currency: fb.currency,
          source: "windsor",
          liveError: detail,
        });
      }
    }

    const { rows, degraded, fetchedAt, clampedTo, currency } = await getAdRows(range, force);
    return NextResponse.json({
      rows,
      degraded,
      fetchedAt,
      range,
      clampedTo,
      currency,
      source: "windsor",
      liveAvailable: metaConfigured(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fallo al leer Windsor.ai";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
