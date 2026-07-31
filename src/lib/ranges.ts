import type { DateRange, RangeId } from "./types";

/**
 * The ad account reports on New York time, so every "day" in this dashboard is
 * a New York day. Using the browser's clock instead put Madrid a day ahead
 * after midnight and made Windsor reject "today" as a future date.
 *
 * Change this one constant if the account's reporting timezone ever moves.
 */
export const ACCOUNT_TZ = "America/New_York";

// en-CA renders as YYYY-MM-DD, which is the shape Windsor and every comparison
// in this codebase expect.
const ISO_IN_TZ = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACCOUNT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in the account's timezone. */
export function localISO(d: Date = new Date()): string {
  return ISO_IN_TZ.format(d);
}

/**
 * Calendar arithmetic on a date-only value. Done in UTC on purpose: shifting a
 * bare date has no time component to move, so a DST boundary must not add or
 * drop an hour and slide the answer onto the wrong day.
 */
export function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

export const RANGES: { id: RangeId; label: string; hint?: string }[] = [
  { id: "today", label: "Hoy", hint: "Día en curso — los datos aún se están acumulando" },
  { id: "yesterday", label: "Ayer", hint: "Último día completo" },
  { id: "last_7d", label: "7 días" },
  { id: "last_14d", label: "14 días" },
  { id: "last_30d", label: "30 días" },
  { id: "last_90d", label: "90 días" },
  { id: "this_month", label: "Este mes" },
  { id: "custom", label: "Personalizado", hint: "Elige tú las fechas" },
];

/** Fill in the dates a range needs before it goes to Windsor. */
export function resolveRange(range: DateRange): DateRange {
  const today = localISO();
  switch (range.id) {
    case "today":
      return { id: "today", from: today, to: today };
    case "yesterday": {
      const y = shiftDays(today, -1);
      return { id: "yesterday", from: y, to: y };
    }
    case "custom": {
      const to = range.to || today;
      const from = range.from || shiftDays(to, -6);
      // A backwards range returns nothing at all rather than erroring, so swap.
      return from <= to ? { id: "custom", from, to } : { id: "custom", from: to, to: from };
    }
    default:
      return { id: range.id };
  }
}

/**
 * The concrete [from, to] a range covers, computed here rather than left to
 * Windsor. Verified to match its presets exactly (`last_7d` and the equivalent
 * explicit window both return 417.17 on this account), which is what lets the
 * comparison period be derived from the same arithmetic.
 *
 * Rolling windows end yesterday — today is still accruing and would drag every
 * comparison.
 */
export function effectiveWindow(range: DateRange): { from: string; to: string } {
  const today = localISO();
  const yesterday = shiftDays(today, -1);
  const rolling = (days: number) => ({ from: shiftDays(today, -days), to: yesterday });

  switch (range.id) {
    case "today": return { from: today, to: today };
    case "yesterday": return { from: yesterday, to: yesterday };
    case "last_7d": return rolling(7);
    case "last_14d": return rolling(14);
    case "last_30d": return rolling(30);
    case "last_90d": return rolling(90);
    case "this_month": return { from: `${today.slice(0, 7)}-01`, to: yesterday };
    case "custom": {
      const r = resolveRange(range);
      return { from: r.from!, to: r.to! };
    }
  }
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

/** The equally long window immediately before the current one. */
export function previousWindow(range: DateRange): { from: string; to: string } {
  const { from, to } = effectiveWindow(range);
  const len = Math.max(1, daysBetween(from, to));
  return { from: shiftDays(from, -len), to: shiftDays(from, -1) };
}

export function describeWindow(range: DateRange): string {
  const { from, to } = effectiveWindow(range);
  return from === to ? from : `${from} → ${to}`;
}

export function describeRange(range: DateRange): string {
  const meta = RANGES.find((r) => r.id === range.id);
  if (range.id === "custom" && range.from && range.to) {
    return range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  }
  return meta?.label ?? range.id;
}

export const isRangeId = (v: string): v is RangeId => RANGES.some((r) => r.id === v);
