import { computeLaunchMetrics, computeMetrics, dailySeries, groupBy } from "./metrics";
import type { AdRow, Launch, Metrics } from "./types";

const r = (v: number | null, d = 2): number | null =>
  v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d));

/** Trim a Metrics object down to what the model actually needs to reason. */
const slim = (m: Metrics) => ({
  spend: r(m.spend),
  impressions: m.impressions,
  clicks: m.clicks,
  linkClicks: m.linkClicks,
  landingPageViews: m.landingPageViews,
  registrados: m.registrations,
  leadsCualificados: m.leads,
  cpm: r(m.cpm),
  cpc: r(m.cpc),
  ctr: r(m.ctr, 4),
  costePorRegistrado: r(m.cpr),
  costePorLeadCualificado: r(m.cpl),
  tasaCualificacion: r(m.qualificationRate, 4),
  leadRatePerLinkClick: r(m.leadRate, 4),
  lpvToLeadRate: r(m.lpvToLeadRate, 4),
  days: m.days,
  dailySpend: r(m.dailySpend),
});

/**
 * A compact, complete picture of the account for the model.
 *
 * Everything is pre-aggregated: the model reasons about the numbers rather than
 * re-deriving them from thousands of raw rows, and every ratio here came from
 * summed counters so it is correct at each level.
 */
export function buildDigest(rows: AdRow[], launches: Launch[], preset: string, currency = "USD") {
  const account = computeMetrics(rows);

  return {
    ventana: preset,
    moneda: currency,
    glosario: {
      registrados: "Todo el que completó el registro. Es el total de leads que entraron.",
      leadsCualificados: "Subconjunto de los registrados que supera 3 de scoring. Solo estos se reportan a Meta como lead.",
      tasaCualificacion: "leadsCualificados ÷ registrados",
    },
    cuenta: {
      nombre: rows[0]?.accountName ?? "(desconocida)",
      ...slim(account),
      diasConDatos: account.days,
    },
    porCampana: groupBy(rows, "campaign").map((s) => ({
      campana: s.key,
      objetivo: s.rows[0]?.objective ?? "",
      estado: s.rows[0]?.campaignStatus ?? "",
      ...slim(s.metrics),
    })),
    porConjunto: groupBy(rows, "adset").map((s) => ({
      conjunto: s.key,
      campana: s.rows[0]?.campaign ?? "",
      ...slim(s.metrics),
    })),
    porAnuncio: groupBy(rows, "adName").map((s) => ({
      anuncio: s.key,
      campanas: [...new Set(s.rows.map((x) => x.campaign))],
      ...slim(s.metrics),
    })),
    serieDiaria: dailySeries(rows).map((d) => ({
      fecha: d.date,
      spend: r(d.spend),
      impresiones: d.impressions,
      clicks: d.clicks,
      registrados: d.registrations,
      leadsCualificados: d.leads,
      costePorLeadCualificado: r(d.cpl),
    })),
    lanzamientos: launches.map((l) => {
      const lm = computeLaunchMetrics(l, rows);
      return {
        nombre: l.name,
        fechaEvento: l.eventDate,
        ventana: `${l.startDate} → ${l.endDate}`,
        campanasIncluidas: l.campaigns.length ? l.campaigns : "todas",
        inversionAds: r(lm.ads.spend),
        registrados: lm.registrations,
        leadsCualificados: lm.ads.leads,
        asistentes: lm.showUps,
        seQuedaronALaOferta: lm.stayedToOffer,
        llamadasAgendadas: lm.callsBooked,
        llamadasRealizadas: lm.callsTaken,
        unidadesVendidas: lm.unitsSold,
        tickets: l.tickets.map((t) => ({ nombre: t.name, precio: t.price, unidades: t.units })),
        facturacionContratada: r(lm.contractedRevenue),
        cashCollected: r(lm.cashCollected),
        otrosCostes: r(lm.extraCostTotal),
        costeTotal: r(lm.totalCost),
        beneficio: r(lm.profit),
        costePorLeadCualificado: r(lm.ads.cpl),
        costePorAsistente: r(lm.costPerShowUp),
        cac: r(lm.cac),
        cacTotal: r(lm.fullCac),
        aov: r(lm.aov),
        tasaAsistencia: r(lm.showUpRate, 4),
        tasaCierre: r(lm.closeRate, 4),
        tasaCobro: r(lm.cashCollectionRate, 4),
        roasContratado: r(lm.roas),
        roasCash: r(lm.cashRoas),
        roasNeto: r(lm.netRoas),
        margen: r(lm.margin, 4),
        notas: l.notes || null,
      };
    }),
  };
}

/** The per-ad context a creative analysis needs: the ad, and the bar it is judged against. */
export function buildAdContext(rows: AdRow[], adName: string) {
  const account = computeMetrics(rows);
  const mine = rows.filter((x) => x.adName === adName);
  if (!mine.length) return { anuncio: adName, sinDatos: true, cuenta: slim(account) };

  const m = computeMetrics(mine);
  const peers = groupBy(rows, "adName")
    .filter((s) => s.key !== adName)
    .map((s) => ({ anuncio: s.key, spend: r(s.metrics.spend), registrados: s.metrics.registrations, leadsCualificados: s.metrics.leads, costePorLeadCualificado: r(s.metrics.cpl), ctr: r(s.metrics.ctr, 4) }));

  return {
    anuncio: adName,
    campanas: [...new Set(mine.map((x) => x.campaign))],
    conjuntos: [...new Set(mine.map((x) => x.adset))],
    metricas: slim(m),
    mediaDeLaCuenta: slim(account),
    otrosAnunciosDeLaCuenta: peers,
  };
}
