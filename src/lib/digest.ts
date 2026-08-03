import { computeLaunchMetrics, computeMetrics, dailySeries, groupBy } from "./metrics";
import { classifySlice, isLeadGen, KIND_LABEL, splitByLeadGen } from "./objective";
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
 *
 * `cuenta` and `serieDiaria` are computed from LEAD-GEN campaigns only (see
 * objective.ts). A ThruPlay or traffic campaign can't produce a lead by
 * design, so folding its spend into the account CPL inflates it against a
 * lead count that campaign never contributed to. This is not hypothetical —
 * an earlier version of this digest fed the model blended numbers and it
 * recommended reallocating "1. THRUPLAYS" and "2. FOLLOWMEADS" budget as if
 * they were failed lead campaigns, when they were never trying to be one.
 * `campanasFueraDeLeads` keeps that spend visible without polluting the
 * funnel math, and every campaign/adset/ad slice carries its own `tipo`.
 */
export function buildDigest(rows: AdRow[], launches: Launch[], preset: string, currency = "USD") {
  const { leadGen, other } = splitByLeadGen(rows);
  const account = computeMetrics(leadGen);

  return {
    ventana: preset,
    moneda: currency,
    glosario: {
      registrados: "Todo el que completó el registro. Es el total de leads que entraron.",
      leadsCualificados: "Subconjunto de los registrados que supera 3 de scoring. Solo estos se reportan a Meta como lead.",
      tasaCualificacion: "leadsCualificados ÷ registrados",
      tipo: "Objetivo real de la campaña en Meta. Solo 'Generación de leads' se juzga por CPL/leads — el resto (notoriedad, tráfico, interacción) tiene otro propósito y NO debe evaluarse ni recomendarse apagar por falta de leads.",
    },
    cuenta: {
      nombre: rows[0]?.accountName ?? "(desconocida)",
      nota: "Estas cifras son SOLO de campañas de generación de leads. El gasto de otras campañas está en campanasFueraDeLeads, aparte.",
      ...slim(account),
      diasConDatos: account.days,
    },
    campanasFueraDeLeads: other.length
      ? groupBy(other, "campaign").map((s) => ({
          campana: s.key,
          tipo: KIND_LABEL[classifySlice(s.rows)],
          objetivo: s.rows[0]?.objective ?? "",
          spend: r(s.metrics.spend),
          impresiones: s.metrics.impressions,
          clicks: s.metrics.clicks,
          nota: "No es generación de leads. No recomiendes apagarla por falta de leads: no es su objetivo.",
        }))
      : [],
    porCampana: groupBy(leadGen, "campaign").map((s) => ({
      campana: s.key,
      tipo: KIND_LABEL[classifySlice(s.rows)],
      objetivo: s.rows[0]?.objective ?? "",
      estado: s.rows[0]?.campaignStatus ?? "",
      ...slim(s.metrics),
    })),
    porConjunto: groupBy(leadGen, "adset").map((s) => ({
      conjunto: s.key,
      campana: s.rows[0]?.campaign ?? "",
      ...slim(s.metrics),
    })),
    porAnuncio: groupBy(leadGen, "adName").map((s) => ({
      anuncio: s.key,
      campanas: [...new Set(s.rows.map((x) => x.campaign))],
      ...slim(s.metrics),
    })),
    serieDiaria: dailySeries(leadGen).map((d) => ({
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
  const { leadGen } = splitByLeadGen(rows);
  const account = computeMetrics(leadGen);
  const mine = rows.filter((x) => x.adName === adName);
  if (!mine.length) return { anuncio: adName, sinDatos: true, mediaDeLaCuentaDeLeads: slim(account) };

  const m = computeMetrics(mine);
  const tipo = classifySlice(mine);
  const peers = groupBy(leadGen, "adName")
    .filter((s) => s.key !== adName)
    .map((s) => ({ anuncio: s.key, spend: r(s.metrics.spend), registrados: s.metrics.registrations, leadsCualificados: s.metrics.leads, costePorLeadCualificado: r(s.metrics.cpl), ctr: r(s.metrics.ctr, 4) }));

  return {
    anuncio: adName,
    tipo: KIND_LABEL[tipo],
    notaTipo: isLeadGen(tipo)
      ? "Esta campaña es de generación de leads: analiza el creativo también por CPL y tasa de cualificación."
      : "Esta campaña NO es de generación de leads. No juzgues el creativo por CPL, leads ni tasa de cualificación — evalúalo por lo que sí puede medirse (CTR, retención de vídeo, coste por resultado del objetivo real) y dilo explícitamente en el análisis.",
    campanas: [...new Set(mine.map((x) => x.campaign))],
    conjuntos: [...new Set(mine.map((x) => x.adset))],
    metricas: slim(m),
    mediaDeLaCuentaDeLeads: slim(account),
    otrosAnunciosDeLaCuentaDeLeads: peers,
  };
}
