import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { buildAdContext } from "@/lib/digest";
import { callClaude, friendlyError, MODEL } from "@/lib/claude";
import { newId, updateStore } from "@/lib/store";
import { getAdRows } from "@/lib/windsor";
import { isRangeId, resolveRange } from "@/lib/ranges";
import type { CreativeAnalysis, DateRange } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const SCORE = { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analisis", "hooks", "fortalezas", "debilidades", "sugerencias", "puntuaciones"],
  properties: {
    analisis: {
      type: "string",
      description:
        "Análisis en markdown: por qué este creativo rinde como rinde, conectando lo que se ve o se lee con sus números reales.",
    },
    hooks: { type: "array", items: { type: "string" }, description: "Los ganchos que usa el creativo, tal cual aparecen." },
    fortalezas: { type: "array", items: { type: "string" } },
    debilidades: { type: "array", items: { type: "string" } },
    sugerencias: {
      type: "array",
      items: { type: "string" },
      description: "Cambios concretos y accionables. Cuando sea copy, escribe la versión nueva literal.",
    },
    puntuaciones: {
      type: "object",
      additionalProperties: false,
      required: ["claridadOferta", "fuerzaHook", "pruebaSocial", "llamadaAccion", "jerarquiaVisual", "encajePublico"],
      properties: {
        claridadOferta: SCORE,
        fuerzaHook: SCORE,
        pruebaSocial: SCORE,
        llamadaAccion: SCORE,
        jerarquiaVisual: SCORE,
        encajePublico: SCORE,
      },
    },
  },
} as const;

const SYSTEM = `Eres un director creativo de performance especializado en Meta Ads para lanzamientos
de infoproducto. Analizas un creativo real (imagen/flyer o guion) junto con sus métricas reales.
Respondes SIEMPRE en español.

CÓMO TRABAJAS

1. Describe lo que REALMENTE ves o lees. Nada de suposiciones sobre elementos que no están.
   Si la imagen está cortada, borrosa o no se lee bien, dilo.
2. Conecta creatividad con números. Un CTR bajo apunta a un problema de gancho o segmentación;
   un CTR alto con CPL alto apunta a desajuste entre la promesa del anuncio y la landing.
   Di qué hipótesis sostiene cada número y cuál descarta.
3. En esta cuenta "registrados" es todo el que se apuntó y "leadsCualificados" son solo los
   que superan 3 de scoring (el subconjunto que se reporta a Meta). Un creativo puede traer
   muchos registrados y pocos cualificados: eso es una promesa que atrae al público equivocado,
   no un problema de volumen.
4. Respeta el tamaño de muestra. Con pocos clics o pocos leads, tu lectura es una hipótesis,
   no un diagnóstico: márcalo como tal en vez de afirmar con seguridad falsa.
5. Compara contra la media de la cuenta que recibes, no contra benchmarks genéricos del sector.
6. Las sugerencias son reescrituras literales, no consejos genéricos. En vez de "mejora el titular",
   escribe el titular nuevo. En vez de "añade prueba social", di exactamente qué frase poner y dónde.
7. Las puntuaciones van de 1 a 10 y son relativas a lo que exige el tráfico frío de Meta.
   Sé exigente: un 7 ya es notable.`;

export async function POST(request: Request) {
  let body: {
    adName?: string;
    kind?: "image" | "script";
    imageDataUrl?: string;
    script?: string;
    range?: DateRange;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const adName = (body.adName ?? "").trim();
  const kind = body.kind === "script" ? "script" : "image";
  const range: DateRange = body.range?.id && isRangeId(body.range.id)
    ? resolveRange({ id: body.range.id, from: body.range.from, to: body.range.to })
    : { id: "last_30d" };

  if (!adName) return NextResponse.json({ error: "Falta el nombre del anuncio." }, { status: 400 });

  let mediaType: MediaType | undefined;
  let base64 = "";
  if (kind === "image") {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(body.imageDataUrl ?? "");
    if (!match) {
      return NextResponse.json({ error: "Adjunta una imagen válida del anuncio." }, { status: 400 });
    }
    if (!MEDIA_TYPES.includes(match[1] as MediaType)) {
      return NextResponse.json(
        { error: `Formato no soportado (${match[1]}). Usa JPG, PNG, GIF o WEBP.` },
        { status: 400 },
      );
    }
    mediaType = match[1] as MediaType;
    base64 = match[2];
    // Base64 is ~4/3 of the raw bytes; the API caps a request at 32 MB.
    if (base64.length * 0.75 > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "La imagen supera los 5 MB. Redúcela e inténtalo de nuevo." }, { status: 413 });
    }
  } else if (!body.script?.trim()) {
    return NextResponse.json({ error: "Pega el guion del anuncio." }, { status: 400 });
  }

  try {
    const { rows } = await getAdRows(range);
    const context = buildAdContext(rows, adName);

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];

    if (kind === "image" && mediaType) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
      content.push({
        type: "text",
        text:
          `Este es el creativo del anuncio "${adName}". Analízalo contra sus métricas reales.\n` +
          (body.notes?.trim() ? `\nContexto que añade el usuario: ${body.notes.trim()}\n` : "") +
          `\nMÉTRICAS:\n\`\`\`json\n${JSON.stringify(context, null, 1)}\n\`\`\``,
      });
    } else {
      content.push({
        type: "text",
        text:
          `Guion del anuncio "${adName}":\n"""\n${body.script!.trim()}\n"""\n` +
          (body.notes?.trim() ? `\nContexto que añade el usuario: ${body.notes.trim()}\n` : "") +
          `\nMÉTRICAS:\n\`\`\`json\n${JSON.stringify(context, null, 1)}\n\`\`\``,
      });
    }

    type Parsed = {
      analisis: string;
      hooks: string[];
      fortalezas: string[];
      debilidades: string[];
      sugerencias: string[];
      puntuaciones: Record<string, number>;
    };

    const { parsed, refused, model, text } = await callClaude<Parsed>({
      system: SYSTEM,
      effort: "high",
      maxTokens: 12000,
      schema: SCHEMA as unknown as Record<string, unknown>,
      content,
    });

    if (refused) {
      return NextResponse.json({ error: "Claude no pudo analizar este creativo." }, { status: 422 });
    }
    if (!parsed) {
      return NextResponse.json(
        { error: `Respuesta no interpretable del modelo.${text ? ` Devolvió: ${text.slice(0, 160)}` : ""}` },
        { status: 502 },
      );
    }

    const analysis: CreativeAnalysis = {
      id: newId(),
      adName,
      kind,
      imageDataUrl: kind === "image" ? body.imageDataUrl : undefined,
      mediaType,
      script: kind === "script" ? body.script!.trim() : undefined,
      analysis: parsed.analisis,
      hooks: parsed.hooks ?? [],
      strengths: parsed.fortalezas ?? [],
      weaknesses: parsed.debilidades ?? [],
      suggestions: parsed.sugerencias ?? [],
      scores: parsed.puntuaciones ?? {},
      snapshot: "metricas" in context ? (context.metricas as CreativeAnalysis["snapshot"]) : null,
      createdAt: new Date().toISOString(),
      model: model || MODEL,
    };

    // Analysed once, kept forever — the creative and its verdict stay on file.
    await updateStore((s) => {
      s.creatives = s.creatives.filter((c) => !(c.adName === adName && c.kind === kind));
      s.creatives.unshift(analysis);
    });

    return NextResponse.json(analysis);
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
