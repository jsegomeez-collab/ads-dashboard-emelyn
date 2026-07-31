import { ACCOUNT_TZ, localISO, shiftDays } from "./ranges";

const DASH = "—";

// The ad account bills in USD; Windsor reports the real code and setCurrency
// applies it, so this is only the value used before the first fetch lands.
let currency = "USD";
export const setCurrency = (c: string) => { if (c) currency = c; };
export const getCurrency = () => currency;

// Spanish number conventions throughout (1.234,56) with a narrow symbol, so
// "$" reads clean instead of Intl's default "US$".
const money = (opts: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency, currencyDisplay: "narrowSymbol", ...opts });

const money0 = () => money({ maximumFractionDigits: 0 });
const money2 = () => money({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (v: number | null | undefined, decimals = 2): string =>
  v == null || !Number.isFinite(v) ? DASH : (decimals === 0 ? money0() : money2()).format(v);

export const fmtNum = (v: number | null | undefined, decimals = 0): string =>
  v == null || !Number.isFinite(v)
    ? DASH
    : new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);

export const fmtPct = (v: number | null | undefined, decimals = 1): string =>
  v == null || !Number.isFinite(v)
    ? DASH
    : new Intl.NumberFormat("es-ES", { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);

export const fmtX = (v: number | null | undefined, decimals = 2): string =>
  v == null || !Number.isFinite(v) ? DASH : `${fmtNum(v, decimals)}×`;

export const fmtCompact = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v)
    ? DASH
    : new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(v);

/** "21 jul" — short axis label from an ISO date. */
export const fmtDayShort = (iso: string): string => {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
};

/** Timestamps read in the account's timezone, so "última lectura" lines up with the data. */
export const fmtDateLong = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ACCOUNT_TZ,
  }).format(d);
};

// Local calendar dates — see the note in ranges.ts on why UTC is wrong here.
export const todayISO = (): string => localISO();

export const daysAgoISO = (n: number): string => shiftDays(localISO(), -n);
