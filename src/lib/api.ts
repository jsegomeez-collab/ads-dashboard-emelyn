"use client";

/**
 * The AI endpoints run 60–120 s. Over that window a plain `fetch` can die from a
 * dev-server recompile, a laptop sleeping, or a flaky connection, and the browser
 * reports the whole class as a bare "Failed to fetch" — which tells the user
 * nothing and looks like the feature is broken.
 *
 * This wrapper gives every failure a cause the user can act on, and bounds the
 * wait so a dead request fails instead of spinning forever.
 */
export interface PostOptions {
  timeoutMs?: number;
  /** Called with elapsed seconds so the UI can show the request is alive. */
  onTick?: (seconds: number) => void;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  { timeoutMs = 240_000, onTick }: PostOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const started = Date.now();

  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const ticker = onTick
    ? setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 1000)
    : null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      if (!res.ok) throw new Error(`El servidor respondió ${res.status} sin detalle.`);
      throw new Error("El servidor devolvió una respuesta ilegible.");
    }

    if (!res.ok) {
      const msg = (json as { error?: string })?.error;
      throw new Error(msg || `El servidor respondió ${res.status}.`);
    }
    return json as T;
  } catch (err) {
    if (controller.signal.aborted) {
      const mins = Math.round(timeoutMs / 60000);
      throw new Error(
        `La petición pasó de ${mins} min sin respuesta y se canceló. Vuelve a intentarlo; si se repite, prueba con una imagen más pequeña.`,
      );
    }
    // A TypeError here is fetch's catch-all for "the connection never completed".
    if (err instanceof TypeError) {
      throw new Error(
        "Se cortó la conexión con el servidor. Suele pasar si el servidor se ha reiniciado o si has cerrado el portátil mientras analizaba. Comprueba que `npm run dev` sigue corriendo y reinténtalo.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (ticker) clearInterval(ticker);
  }
}
