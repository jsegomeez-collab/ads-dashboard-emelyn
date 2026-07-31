"use client";

import { useMemo, useState } from "react";
import type { AdRow, ExtraCost, Launch, Store, TicketSale } from "@/lib/types";
import { computeLaunchMetrics } from "@/lib/metrics";
import { daysAgoISO, fmtMoney, fmtNum, fmtPct, fmtX, todayISO } from "@/lib/format";
import { Card, Empty, Labeled, Modal, NumberField, SectionTitle, Stat } from "./ui";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const blankLaunch = (): Launch => ({
  id: uid(),
  name: "",
  eventDate: todayISO(),
  startDate: daysAgoISO(14),
  endDate: todayISO(),
  campaigns: [],
  registrationsManual: null,
  showUps: 0,
  stayedToOffer: 0,
  callsBooked: 0,
  callsTaken: 0,
  tickets: [{ id: uid(), name: "Ticket principal", price: 0, units: 0 }],
  cashCollected: 0,
  extraCosts: [],
  notes: "",
});

export default function LaunchPanel({
  rows,
  store,
  setStore,
  campaigns,
}: {
  rows: AdRow[];
  store: Store | null;
  setStore: (s: Store) => void;
  campaigns: string[];
}) {
  const [editing, setEditing] = useState<Launch | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launches = store?.launches ?? [];

  const save = async (launch: Launch) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveLaunch", payload: launch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      setStore(json);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch("/api/store", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deleteLaunch", payload: { id } }),
    });
    if (res.ok) setStore(await res.json());
  };

  return (
    <section>
      <SectionTitle
        eyebrow="Negocio"
        title="Lanzamientos"
        right={<button className="btn btn-gold" onClick={() => setEditing(blankLaunch())}>+ Nuevo lanzamiento</button>}
      />

      <p className="text-[12px] text-[var(--text-secondary)] mb-4 max-w-3xl leading-relaxed">
        Aquí se cierra el círculo: el gasto y los leads los trae Meta automáticamente, y tú metes lo que
        Meta nunca ve — cuánta gente entró al webinar, cuántas compraron a cada ticket y cuánto cash se
        recogió de verdad. Con eso se calculan el ROAS, el CAC y el beneficio real.
      </p>

      {!launches.length ? (
        <Card>
          <Empty
            title="Todavía no hay ningún lanzamiento"
            body="Crea uno, elige la ventana de fechas y las campañas que lo alimentaron, y rellena los números del embudo. El ROAS aparecerá solo."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {launches.map((l) => (
            <LaunchCard key={l.id} launch={l} rows={rows} onEdit={() => setEditing(l)} onDelete={() => void remove(l.id)} />
          ))}
        </div>
      )}

      {/* Keyed by id so opening a different launch remounts the form with fresh
          state — no derived-state sync to get subtly wrong. */}
      {editing ? (
        <LaunchEditor
          key={editing.id}
          launch={editing}
          campaigns={campaigns}
          saving={saving}
          error={error}
          onClose={() => { setEditing(null); setError(null); }}
          onSave={save}
        />
      ) : null}
    </section>
  );
}

function LaunchCard({
  launch,
  rows,
  onEdit,
  onDelete,
}: {
  launch: Launch;
  rows: AdRow[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const m = useMemo(() => computeLaunchMetrics(launch, rows), [launch, rows]);
  const profitable = m.profit > 0;
  const hasSales = m.unitsSold > 0 || m.cashCollected > 0;

  return (
    <Card lift className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-tight">{launch.name || "(sin nombre)"}</h3>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Evento {launch.eventDate} · Ventana {launch.startDate} → {launch.endDate} ·{" "}
            {launch.campaigns.length ? `${launch.campaigns.length} campaña(s)` : "todas las campañas"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={onEdit}>Editar</button>
          <button className="btn" onClick={onDelete} title="Eliminar lanzamiento">Eliminar</button>
        </div>
      </div>

      {!hasSales ? (
        <div className="mb-4 text-[12px] rounded-xl px-3.5 py-2.5" style={{ background: "var(--gold-wash)", border: "1px solid var(--gold-edge)" }}>
          Rellena ventas y cash recogido para que se calculen ROAS, CAC y beneficio.
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Inversión en ads" value={fmtMoney(m.ads.spend, 0)} sub={`${fmtNum(m.ads.leads)} leads · CPL ${fmtMoney(m.ads.cpl)}`} />
        <Stat label="Cash recogido" value={fmtMoney(m.cashCollected, 0)} sub={`Contratado ${fmtMoney(m.contractedRevenue, 0)}`} accent />
        <Stat
          label="ROAS (cash)"
          value={fmtX(m.cashRoas)}
          sub={m.breakevenRoas != null ? `Break-even en ${fmtX(m.breakevenRoas)}` : "cash ÷ inversión"}
          accent
        />
        <Stat
          label="Beneficio"
          value={fmtMoney(m.profit, 0)}
          sub={`Margen ${fmtPct(m.margin, 0)}`}
          footer={
            hasSales ? (
              <span className="text-[11px] font-medium inline-flex items-center gap-1.5" style={{ color: profitable ? "var(--delta-up)" : "var(--delta-down)" }}>
                <span aria-hidden>{profitable ? "▲" : "▼"}</span>
                {profitable ? "En positivo" : "En pérdidas"}
              </span>
            ) : null
          }
        />
      </div>

      <div className="gold-rule my-4" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-3 text-[12px]">
        <Metric label="Registros" value={fmtNum(m.registrations)} />
        <Metric
          label="Asistentes"
          value={fmtNum(m.showUps)}
          // A rate above 100% means the registration base is wrong, not that the
          // webinar over-performed — usually Meta only attributed part of them.
          hint={
            m.showUpRate != null && m.showUpRate > 1
              ? "Hay más asistentes que registros: rellena «Registros» a mano"
              : `Tasa de asistencia ${fmtPct(m.showUpRate, 0)}`
          }
        />
        <Metric label="Coste / asistente" value={fmtMoney(m.costPerShowUp)} />
        <Metric label="Llamadas hechas" value={fmtNum(m.callsTaken)} hint={`De ${fmtNum(m.callsBooked)} agendadas`} />
        <Metric label="Unidades vendidas" value={fmtNum(m.unitsSold)} hint={`Cierre ${fmtPct(m.closeRate, 1)} sobre asistentes`} />
        <Metric label="Ticket medio" value={fmtMoney(m.aov, 0)} />
        <Metric label="CAC (solo ads)" value={fmtMoney(m.cac, 0)} />
        <Metric label="CAC total" value={fmtMoney(m.fullCac, 0)} hint="Incluye costes extra" />
        <Metric label="Otros costes" value={fmtMoney(m.extraCostTotal, 0)} />
        <Metric label="Coste total" value={fmtMoney(m.totalCost, 0)} />
        <Metric label="Tasa de cobro" value={fmtPct(m.cashCollectionRate, 0)} hint="Cash ÷ contratado" />
        <Metric label="Ingreso por lead" value={fmtMoney(m.earningsPerLead)} />
      </div>

      {launch.tickets.some((t) => t.units > 0) ? (
        <>
          <div className="gold-rule my-4" />
          <div className="scroll-x">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1.5 pr-4 font-medium">Ticket</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Precio</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Unidades</th>
                  <th className="py-1.5 font-medium text-right">Facturado</th>
                </tr>
              </thead>
              <tbody>
                {launch.tickets.filter((t) => t.units > 0).map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--hairline)" }}>
                    <td className="py-1.5 pr-4">{t.name}</td>
                    <td className="py-1.5 pr-4 text-right tnum">{fmtMoney(t.price, 0)}</td>
                    <td className="py-1.5 pr-4 text-right tnum">{fmtNum(t.units)}</td>
                    <td className="py-1.5 text-right tnum font-medium">{fmtMoney(t.price * t.units, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {launch.notes ? (
        <p className="text-[12px] text-[var(--text-secondary)] mt-4 leading-relaxed">{launch.notes}</p>
      ) : null}
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className="tnum font-semibold text-[13px]">{value}</div>
      {hint ? <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{hint}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- editor -- */

function LaunchEditor({
  launch,
  campaigns,
  saving,
  error,
  onClose,
  onSave,
}: {
  launch: Launch;
  campaigns: string[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (l: Launch) => void;
}) {
  const [draft, setDraft] = useState<Launch>(launch);

  const set = <K extends keyof Launch>(k: K, v: Launch[K]) => setDraft({ ...draft, [k]: v });

  const setTicket = (id: string, patch: Partial<TicketSale>) =>
    set("tickets", draft.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const setCost = (id: string, patch: Partial<ExtraCost>) =>
    set("extraCosts", draft.extraCosts.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const contracted = draft.tickets.reduce((a, t) => a + t.price * t.units, 0);

  return (
    <Modal open onClose={onClose} title={draft.name ? `Editar · ${draft.name}` : "Nuevo lanzamiento"} wide>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Labeled label="Nombre del lanzamiento">
            <input className="field" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Webinar 1 — Julio" />
          </Labeled>
          <Labeled label="Fecha del evento">
            <input className="field" type="date" value={draft.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
          </Labeled>
          <Labeled label="Inicio de la ventana de ads" hint="Primer día de gasto que cuenta para este lanzamiento">
            <input className="field" type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Labeled>
          <Labeled label="Fin de la ventana de ads">
            <input className="field" type="date" value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Labeled>
        </div>

        {campaigns.length ? (
          <Labeled label="Campañas que alimentan este lanzamiento" hint="Sin marcar ninguna, cuenta todas">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {campaigns.map((c) => {
                const on = draft.campaigns.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className="chip"
                    data-on={on}
                    onClick={() => set("campaigns", on ? draft.campaigns.filter((x) => x !== c) : [...draft.campaigns, c])}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Labeled>
        ) : null}

        <div>
          <div className="eyebrow mb-2">Embudo del evento</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Labeled label="Registros" hint="Déjalo vacío para usar el dato de Meta">
              <NumberField value={draft.registrationsManual} onChange={(v) => set("registrationsManual", v || null)} placeholder="auto" />
            </Labeled>
            <Labeled label="Asistentes">
              <NumberField value={draft.showUps} onChange={(v) => set("showUps", v)} />
            </Labeled>
            <Labeled label="Llegan a la oferta">
              <NumberField value={draft.stayedToOffer} onChange={(v) => set("stayedToOffer", v)} />
            </Labeled>
            <Labeled label="Llamadas agendadas">
              <NumberField value={draft.callsBooked} onChange={(v) => set("callsBooked", v)} />
            </Labeled>
            <Labeled label="Llamadas realizadas">
              <NumberField value={draft.callsTaken} onChange={(v) => set("callsTaken", v)} />
            </Labeled>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">Ventas por ticket</div>
            <button
              type="button"
              className="btn"
              onClick={() => set("tickets", [...draft.tickets, { id: uid(), name: "", price: 0, units: 0 }])}
            >
              + Añadir ticket
            </button>
          </div>
          <div className="space-y-2">
            {draft.tickets.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_110px_92px_auto] gap-2 items-center">
                <input className="field" placeholder="Nombre del ticket" value={t.name} onChange={(e) => setTicket(t.id, { name: e.target.value })} />
                <NumberField value={t.price} step={50} onChange={(v) => setTicket(t.id, { price: v })} placeholder="Precio" />
                <NumberField value={t.units} onChange={(v) => setTicket(t.id, { units: v })} placeholder="Uds." />
                <button
                  type="button"
                  className="btn"
                  onClick={() => set("tickets", draft.tickets.filter((x) => x.id !== t.id))}
                  aria-label="Quitar ticket"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] mt-2 tnum">
            Facturación contratada: <strong>{fmtMoney(contracted, 0)}</strong>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Labeled label="Cash recogido de verdad" hint="Lo que ha entrado en banco, no lo contratado">
            <NumberField value={draft.cashCollected} step={100} onChange={(v) => set("cashCollected", v)} />
          </Labeled>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="eyebrow">Otros costes</div>
              <button
                type="button"
                className="btn !py-1 !px-2.5 !text-[12px]"
                onClick={() => set("extraCosts", [...draft.extraCosts, { id: uid(), name: "", amount: 0 }])}
              >
                + Añadir
              </button>
            </div>
            <div className="space-y-2">
              {draft.extraCosts.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_110px_auto] gap-2">
                  <input className="field" placeholder="Setter, closer, herramientas…" value={c.name} onChange={(e) => setCost(c.id, { name: e.target.value })} />
                  <NumberField value={c.amount} step={50} onChange={(v) => setCost(c.id, { amount: v })} />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => set("extraCosts", draft.extraCosts.filter((x) => x.id !== c.id))}
                    aria-label="Quitar coste"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {!draft.extraCosts.length ? (
                <div className="text-[11px] text-[var(--text-muted)]">Comisiones, closers, herramientas… se restan del beneficio.</div>
              ) : null}
            </div>
          </div>
        </div>

        <Labeled label="Notas">
          <textarea
            className="field"
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Qué pasó, qué cambiaste, qué probar la próxima vez…"
          />
        </Labeled>

        {error ? (
          <div className="text-[12px] flex items-center gap-2" style={{ color: "var(--status-critical)" }}>
            <span aria-hidden>✕</span> {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" onClick={() => onSave(draft)} disabled={saving || !draft.name.trim()}>
            {saving ? "Guardando…" : "Guardar lanzamiento"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
