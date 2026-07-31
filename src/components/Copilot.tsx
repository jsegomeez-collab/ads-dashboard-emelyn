"use client";

import { useState } from "react";
import type { DateRange, Store } from "@/lib/types";
import { fmtDateLong } from "@/lib/format";
import { postJson } from "@/lib/api";
import { Card, Empty, Markdown, SectionTitle } from "./ui";

const SUGGESTIONS = [
  "¿Qué anuncio debería escalar y cuánto presupuesto le subo?",
  "¿Qué está matando mi coste por lead esta semana?",
  "Dime qué apagar hoy y qué dejar correr.",
  "¿El problema está en el tráfico o en la conversión a lead?",
  "¿Qué debería testear en el próximo lanzamiento?",
];

export default function Copilot({
  store,
  setStore,
  range,
  aiConfigured,
}: {
  store: Store | null;
  setStore: (s: Store) => void;
  range: DateRange;
  aiConfigured: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reports = store?.reports ?? [];

  const run = async (q: string) => {
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      await postJson("/api/ai/strategy", { range, question: q }, { onTick: setElapsed });
      const storeRes = await fetch("/api/store");
      if (storeRes.ok) setStore(await storeRes.json());
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch("/api/store", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deleteReport", payload: { id } }),
    });
    if (res.ok) setStore(await res.json());
  };

  return (
    <section className="space-y-6">
      <div>
        <SectionTitle eyebrow="Inteligencia" title="Copiloto de campaña" />
        <p className="text-[12px] text-[var(--text-secondary)] max-w-3xl leading-relaxed mb-4">
          Claude lee todas las cifras de la cuenta — campañas, conjuntos, anuncios, serie diaria y el embudo
          manual de tus lanzamientos — y te dice qué escalar, qué apagar, qué testear y qué dato te falta
          para decidir mejor. Cita siempre la cifra que sostiene cada recomendación.
        </p>

        {!aiConfigured ? (
          <Card className="p-4 mb-4">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--status-warning)" }}>▲</span>
              <div>
                <div className="font-semibold mb-0.5">Falta la API key de Anthropic</div>
                <span className="text-[var(--text-secondary)]">
                  Pega tu clave en <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>ANTHROPIC_API_KEY</code>
                  {" "}dentro de <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.env.local</code> y reinicia con <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>npm run dev</code>.
                </span>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <textarea
            className="field"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pregunta lo que quieras sobre la cuenta… o déjalo vacío para un análisis completo."
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => setQuestion(s)} disabled={busy}>{s}</button>
            ))}
          </div>

          {error ? (
            <div className="text-[12px] mt-3 flex items-start gap-2" style={{ color: "var(--status-critical)" }}>
              <span aria-hidden>✕</span> {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <span className="text-[11px] text-[var(--text-muted)]">
              Analiza la ventana activa. Tarda 60–120 s; no cierres esta pestaña mientras piensa.
            </span>
            <button className="btn btn-gold" onClick={() => void run(question.trim())} disabled={busy || !aiConfigured}>
              {busy ? `Pensando… ${elapsed}s` : question.trim() ? "Preguntar a Claude" : "Analizar la cuenta"}
            </button>
          </div>

          {busy ? (
            <div className="mt-4 space-y-2">
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
            </div>
          ) : null}
        </Card>
      </div>

      <div>
        <SectionTitle eyebrow="Historial" title={`Informes (${reports.length})`} />
        {!reports.length ? (
          <Card><Empty title="Sin informes todavía" body="Lanza tu primer análisis arriba." /></Card>
        ) : (
          <div className="space-y-4">
            {reports.map((r, i) => (
              <Card key={r.id} lift className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{r.scope}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{fmtDateLong(r.createdAt)} · {r.model}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i === 0 ? (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: "var(--gold-wash)", color: "var(--gold)" }}>
                        MÁS RECIENTE
                      </span>
                    ) : null}
                    <button className="btn" onClick={() => void remove(r.id)} aria-label="Eliminar informe">✕</button>
                  </div>
                </div>
                <div className="gold-rule my-3" />
                <Markdown source={r.markdown} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
