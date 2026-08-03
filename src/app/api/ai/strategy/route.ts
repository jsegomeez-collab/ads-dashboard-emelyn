import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";
import { callClaude, friendlyError, MODEL } from "@/lib/claude";
import { newId, updateStore } from "@/lib/store";
import { getAdRows } from "@/lib/windsor";
import { describeRange, isRangeId, resolveRange } from "@/lib/ranges";
import type { DateRange } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYSTEM = `Eres un media buyer senior de Meta Ads especializado en lanzamientos de infoproducto
(webinar → llamada → venta de ticket alto). Analizas una cuenta real y respondes SIEMPRE en español.

REGLAS INNEGOCIABLES

1. Trabaja SOLO con los números del JSON que recibes. No inventes datos, no estimes cifras que no
   estén ahí y no supongas benchmarks del sector como si fueran datos de esta cuenta.
2. VOCABULARIO DE ESTA CUENTA, no lo confundas nunca:
   - "registrados" = todo el que completó el registro. Es el total de leads que entraron.
   - "leadsCualificados" = el SUBCONJUNTO de registrados que supera 3 de scoring. Es lo único
     que el cliente reporta a Meta como lead. Siempre es menor o igual que registrados.
   El embudo va: vistas de landing → registrados → leads cualificados. Un CPL alto con buena
   tasa de cualificación es un problema de tráfico; una tasa de cualificación baja es un
   problema de calidad de público o de promesa del anuncio. Distínguelos.
3. "cuenta", "porCampana", "porConjunto", "porAnuncio" y "serieDiaria" incluyen SOLO campañas de
   generación de leads (campo "tipo": "Generación de leads"). El campo separado
   "campanasFueraDeLeads" trae el resto (notoriedad/ThruPlay, tráfico, interacción) con su propio
   "tipo" y "objetivo". NUNCA recomiendes apagar, pausar o reasignar el presupuesto de una campaña
   de "campanasFueraDeLeads" por "no generar leads" o "0 leads": no es su objetivo, nunca lo fue, y
   comparar su rendimiento contra el embudo de leads no tiene sentido. Si quieres comentar algo
   sobre ellas, evalúalas por lo que sí miden (notoriedad, tráfico, interacción) — nunca por CPL.
4. Significancia estadística primero. Antes de recomendar apagar o escalar algo, mira el volumen.
   Un anuncio con menos de ~50 clics de enlace o menos de ~5 leads cualificados NO tiene señal suficiente:
   dilo explícitamente y recomienda esperar o dar más presupuesto para aprender, no matarlo.
   Es mejor decir "aún no se sabe" que dar una orden con datos insuficientes.
5. Cita siempre la cifra concreta que sostiene cada afirmación (gasto, leads, CPL, CTR...).
   Sin número, no hay recomendación.
6. Si el embudo manual (asistentes, ventas, cash) está vacío, no calcules ni menciones ROAS:
   di qué falta por rellenar para poder calcularlo.
7. Prioriza por dinero en juego. Un anuncio que se lleva el 40% del gasto importa más que uno con 2 unidades.
8. La divisa de la cuenta viene en el campo "moneda" del JSON. Usa SIEMPRE esa, nunca euros por defecto.

FORMATO DE SALIDA (markdown, sin bloques de código, sin preámbulo):

## Lectura de la cuenta
Tres o cuatro frases: qué está pasando realmente y cuál es el cuello de botella principal
(coste de tráfico, conversión a lead, o conversión a venta). Empieza por la conclusión.

## Acciones ahora
Lista numerada, máximo 5, ordenadas por impacto económico. Cada una con este formato:
**Acción concreta** — el porqué con la cifra exacta. Impacto esperado. Nivel de confianza (alto/medio/bajo)
según el volumen de datos que la respalda.

## Qué NO tocar todavía
Lo que parece malo pero no tiene datos suficientes para decidir. Di cuántos leads o clics más
hacen falta para que la decisión sea fiable.

## Test siguiente
Un único test, el de mayor valor esperado. Qué cambias, contra qué lo comparas, cuánto presupuesto
y durante cuántos días, y qué resultado te haría cambiar de opinión.

## Datos que te faltan
Qué métrica o dato concreto (del panel manual o de Meta) desbloquearía la mejor decisión, y qué
decisión desbloquearía exactamente. Sé específico, no genérico.

Sé directo y denso. Nada de relleno, disclaimers ni recordar lo obvio.`;

export async function POST(request: Request) {
  let range: DateRange = { id: "last_30d" };
  let question = "";
  try {
    const body = await request.json();
    if (body?.range?.id && isRangeId(body.range.id)) {
      range = resolveRange({ id: body.range.id, from: body.range.from, to: body.range.to });
    }
    if (typeof body?.question === "string") question = body.question.trim();
  } catch {
    /* defaults are fine */
  }

  try {
    const [{ rows, currency }, store] = await Promise.all([
      getAdRows(range),
      updateStore(() => {}),
    ]);

    if (!rows.length) {
      return NextResponse.json({ error: "No hay datos de anuncios en esta ventana." }, { status: 400 });
    }

    const digest = buildDigest(rows, store.launches, describeRange(range), currency ?? store.settings.currency);

    const scope = question
      ? `Pregunta concreta del usuario, respóndela dentro del formato:\n${question}`
      : "Analiza la cuenta completa.";

    const { text, refused, model } = await callClaude({
      system: SYSTEM,
      effort: "high",
      maxTokens: 16000,
      content: [
        { type: "text", text: `${scope}\n\nDATOS DE LA CUENTA:\n\`\`\`json\n${JSON.stringify(digest, null, 1)}\n\`\`\`` },
      ],
    });

    if (refused || !text) {
      return NextResponse.json(
        { error: "Claude no pudo completar este análisis. Reformula la pregunta e inténtalo de nuevo." },
        { status: 422 },
      );
    }

    const report = {
      id: newId(),
      createdAt: new Date().toISOString(),
      scope: question || `Cuenta completa · ${describeRange(range)}`,
      markdown: text,
      model: model || MODEL,
    };

    await updateStore((s) => {
      s.reports.unshift(report);
      s.reports = s.reports.slice(0, 30);
    });

    return NextResponse.json(report);
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
