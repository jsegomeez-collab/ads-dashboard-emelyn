import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no está configurada en .env.local");
  }
  client ??= new Anthropic();
  return client;
}

export interface ClaudeResult<T = unknown> {
  text: string;
  parsed: T | null;
  model: string;
  /** true when safety classifiers declined — content is empty or partial */
  refused: boolean;
  refusalCategory?: string | null;
}

interface CallOptions {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** JSON Schema — when set, the reply is constrained to it and returned parsed */
  schema?: Record<string, unknown>;
}

/**
 * One entry point for every Claude call in the app.
 *
 * Server-side fallbacks are on: if Opus 5's safety classifiers decline a
 * request, the API re-runs it on the recommended fallback model inside the same
 * call rather than handing back an empty response. `stop_reason` is checked
 * before reading content — on a refusal `content` is empty or partial, so
 * indexing into it blindly would crash.
 */
export async function callClaude<T = unknown>(opts: CallOptions): Promise<ClaudeResult<T>> {
  const anthropic = getClient();

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      ...(opts.schema ? { format: { type: "json_schema" as const, schema: opts.schema } } : {}),
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });

  const refused = response.stop_reason === "refusal";
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  let parsed: T | null = null;
  if (opts.schema && text && !refused) {
    // With a json_schema format the reply is already valid JSON. The fence strip
    // and brace slice are belt-and-braces so a formatting slip degrades into a
    // readable error rather than a crash.
    const candidates = [text, text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()];
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

    for (const c of candidates) {
      try {
        parsed = JSON.parse(c) as T;
        break;
      } catch {
        /* try the next shape */
      }
    }
  }

  return {
    text,
    parsed,
    model: response.model,
    refused,
    refusalCategory: response.stop_details?.type === "refusal" ? response.stop_details.category : null,
  };
}

export function friendlyError(err: unknown): { message: string; status: number } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { message: "La ANTHROPIC_API_KEY no es válida.", status: 401 };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { message: "Límite de peticiones alcanzado. Reinténtalo en un momento.", status: 429 };
  }
  if (err instanceof Anthropic.APIError) {
    return { message: `Error de la API de Claude (${err.status}): ${err.message}`, status: err.status ?? 500 };
  }
  return { message: err instanceof Error ? err.message : "Error desconocido", status: 500 };
}
