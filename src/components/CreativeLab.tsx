"use client";

import { useEffect, useRef, useState } from "react";
import type { CreativeAnalysis, DateRange, Store } from "@/lib/types";
import { fmtDateLong } from "@/lib/format";
import { postJson } from "@/lib/api";
import { Card, Empty, Labeled, Markdown, SectionTitle } from "./ui";

/** Opus 5 reads images up to 2576px on the long edge — keep flyers legible, cap the rest. */
const MAX_EDGE = 2000;
const MAX_BYTES = 4.5 * 1024 * 1024;

async function toDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo abrir la imagen"));
    el.src = raw;
  });

  const longest = Math.max(img.width, img.height);
  if (longest <= MAX_EDGE && raw.length * 0.75 <= MAX_BYTES) return raw;

  const scale = Math.min(1, MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // JPEG at high quality: flyers stay readable, the payload stops being the bottleneck.
  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function CreativeLab({
  store,
  setStore,
  adNames,
  range,
  prefillAd,
  aiConfigured,
}: {
  store: Store | null;
  setStore: (s: Store) => void;
  adNames: string[];
  range: DateRange;
  prefillAd: string | null;
  aiConfigured: boolean;
}) {
  const [adName, setAdName] = useState(prefillAd ?? adNames[0] ?? "");
  const [kind, setKind] = useState<"image" | "script">("image");
  const [image, setImage] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Apply an incoming prefill exactly once. Re-applying it on every render would
  // snap the select back to the prefilled ad the moment the user picked another.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (prefillAd && applied.current !== prefillAd) {
      applied.current = prefillAd;
      setAdName(prefillAd);
    }
  }, [prefillAd]);

  useEffect(() => {
    setAdName((cur) => (cur || adNames[0] || ""));
  }, [adNames]);

  const saved = store?.creatives ?? [];
  const existing = saved.find((c) => c.adName === adName && c.kind === kind) ?? null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setImage(await toDataUrl(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la imagen");
    }
  };

  const analyse = async () => {
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      await postJson("/api/ai/creative", { adName, kind, imageDataUrl: image, script, notes, range }, { onTick: setElapsed });
      const storeRes = await fetch("/api/store");
      if (storeRes.ok) setStore(await storeRes.json());
      setImage(null);
      setScript("");
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
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
      body: JSON.stringify({ action: "deleteCreative", payload: { id } }),
    });
    if (res.ok) setStore(await res.json());
  };

  const canRun = Boolean(adName) && (kind === "image" ? Boolean(image) : script.trim().length > 20);

  return (
    <section className="space-y-6">
      <div>
        <SectionTitle eyebrow="Creatividad" title="Laboratorio de creativos" />
        <p className="text-[12px] text-[var(--text-secondary)] max-w-3xl leading-relaxed mb-4">
          Sube el flyer o pega el guion de un anuncio y Claude lo analiza contra las métricas reales de
          ese anuncio: por qué funciona o por qué no, y qué cambiar exactamente. Cada análisis queda
          guardado, así que solo hay que hacerlo una vez por creativo.
        </p>

        {!aiConfigured ? (
          <Card className="p-4 mb-4">
            <div className="flex items-start gap-2.5 text-[12px]">
              <span aria-hidden style={{ color: "var(--status-warning)" }}>▲</span>
              <div>
                <div className="font-semibold mb-0.5">Falta la API key de Anthropic</div>
                <span className="text-[var(--text-secondary)]">
                  Añade <code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>ANTHROPIC_API_KEY</code> en
                  {" "}<code className="px-1 rounded" style={{ background: "var(--surface-2)" }}>.env.local</code> y reinicia el servidor.
                </span>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-4">
            <Labeled label="Anuncio a analizar">
              {adNames.length ? (
                <select className="field" value={adName} onChange={(e) => setAdName(e.target.value)}>
                  {adNames.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              ) : (
                <input className="field" value={adName} onChange={(e) => setAdName(e.target.value)} placeholder="Nombre del anuncio" />
              )}
            </Labeled>
            <div className="flex gap-1.5">
              <button className="chip" data-on={kind === "image"} onClick={() => setKind("image")}>Flyer / imagen</button>
              <button className="chip" data-on={kind === "script"} onClick={() => setKind("script")}>Guion</button>
            </div>
          </div>

          {kind === "image" ? (
            <div
              className="rounded-xl p-6 text-center transition-colors cursor-pointer"
              style={{ border: `1.5px dashed ${image ? "var(--gold-edge)" : "var(--hairline-strong)"}`, background: image ? "var(--gold-wash)" : "var(--surface-2)" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
              {image ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="Creativo seleccionado" className="max-h-64 mx-auto rounded-lg" style={{ boxShadow: "var(--shadow-soft)" }} />
                  <div className="text-[12px] text-[var(--text-secondary)]">Haz clic para cambiar la imagen</div>
                </div>
              ) : (
                <>
                  <div className="text-[13px] font-medium mb-1">Arrastra el flyer aquí</div>
                  <div className="text-[12px] text-[var(--text-muted)]">o haz clic para elegirlo · PNG, JPG, GIF o WEBP</div>
                </>
              )}
            </div>
          ) : (
            <textarea
              className="field font-mono !text-[12px]"
              rows={9}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={"Pega aquí el guion completo del anuncio: gancho, desarrollo y llamada a la acción."}
            />
          )}

          <div className="mt-3">
            <Labeled label="Contexto extra (opcional)">
              <input
                className="field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Público al que va, oferta, qué te preocupa de este anuncio…"
              />
            </Labeled>
          </div>

          {error ? (
            <div className="text-[12px] mt-3 flex items-start gap-2" style={{ color: "var(--status-critical)" }}>
              <span aria-hidden>✕</span> {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-[11px] text-[var(--text-muted)]">
              {busy
                ? "Claude está mirando el creativo contra sus números. Tarda 60–120 s; no cierres esta pestaña."
                : existing
                  ? `Ya hay un análisis guardado de este anuncio (${fmtDateLong(existing.createdAt)}). Volver a analizar lo reemplaza.`
                  : "Se analizará contra las métricas de la ventana activa. Tarda 60–120 s."}
            </div>
            <button className="btn btn-gold" onClick={() => void analyse()} disabled={!canRun || busy || !aiConfigured}>
              {busy ? `Analizando… ${elapsed}s` : "Analizar creativo"}
            </button>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle eyebrow="Archivo" title={`Análisis guardados (${saved.length})`} />
        {!saved.length ? (
          <Card><Empty title="Aún no hay análisis" body="Sube un flyer o pega un guion arriba para empezar." /></Card>
        ) : (
          <div className="space-y-4">
            {saved.map((c) => <AnalysisCard key={c.id} item={c} onDelete={() => void remove(c.id)} />)}
          </div>
        )}
      </div>
    </section>
  );
}

const SCORE_LABELS: Record<string, string> = {
  claridadOferta: "Claridad de oferta",
  fuerzaHook: "Fuerza del gancho",
  pruebaSocial: "Prueba social",
  llamadaAccion: "Llamada a la acción",
  jerarquiaVisual: "Jerarquía visual",
  encajePublico: "Encaje con el público",
};

function AnalysisCard({ item, onDelete }: { item: CreativeAnalysis; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const scores = Object.entries(item.scores ?? {});
  const avg = scores.length ? scores.reduce((a, [, v]) => a + v, 0) / scores.length : null;

  return (
    <Card lift className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{item.adName}</h3>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {item.kind === "image" ? "Flyer" : "Guion"} · {fmtDateLong(item.createdAt)} · {item.model}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {avg != null ? (
            <span className="text-[12px] tnum font-semibold px-2.5 py-1 rounded-lg" style={{ background: "var(--gold-wash)", color: "var(--gold)" }}>
              {avg.toFixed(1)} / 10
            </span>
          ) : null}
          <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar" : "Ver análisis"}</button>
          <button className="btn" onClick={onDelete} aria-label="Eliminar análisis">✕</button>
        </div>
      </div>

      {scores.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2.5 mt-4">
          {scores.map(([k, v]) => (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[11px] text-[var(--text-secondary)] truncate">{SCORE_LABELS[k] ?? k}</span>
                <span className="text-[11px] tnum font-semibold shrink-0">{v}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${v * 10}%`, background: "var(--series-1)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <>
          <div className="gold-rule my-4" />
          <div className="grid lg:grid-cols-[220px_1fr] gap-5">
            {item.imageDataUrl ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageDataUrl} alt={`Creativo ${item.adName}`} className="w-full rounded-lg" style={{ boxShadow: "var(--shadow-soft)" }} />
              </div>
            ) : item.script ? (
              <pre className="text-[11px] whitespace-pre-wrap leading-relaxed p-3 rounded-lg max-h-[420px] overflow-y-auto" style={{ background: "var(--surface-2)" }}>
                {item.script}
              </pre>
            ) : <div />}

            <div className="min-w-0">
              <Markdown source={item.analysis} />

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <ListBlock title="Ganchos detectados" items={item.hooks} />
                <ListBlock title="Fortalezas" items={item.strengths} accent="var(--status-good)" />
                <ListBlock title="Debilidades" items={item.weaknesses} accent="var(--status-serious)" />
                <ListBlock title="Qué cambiar" items={item.suggestions} accent="var(--gold)" />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function ListBlock({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="eyebrow mb-1.5" style={accent ? { color: accent } : undefined}>{title}</div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="text-[12px] leading-relaxed text-[var(--text-secondary)] flex gap-2">
            <span aria-hidden className="shrink-0" style={{ color: accent ?? "var(--text-muted)" }}>·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
