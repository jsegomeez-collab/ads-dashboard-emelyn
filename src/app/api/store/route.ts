import { NextResponse } from "next/server";
import { newId, readStore, updateStore } from "@/lib/store";
import type { Launch } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readStore());
}

export async function POST(request: Request) {
  let body: { action?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { action, payload } = body;

  try {
    switch (action) {
      case "saveLaunch": {
        const launch = payload as Launch;
        if (!launch?.name?.trim()) {
          return NextResponse.json({ error: "El lanzamiento necesita un nombre" }, { status: 400 });
        }
        const store = await updateStore((s) => {
          const idx = s.launches.findIndex((l) => l.id === launch.id);
          if (idx >= 0) s.launches[idx] = launch;
          else s.launches.push({ ...launch, id: launch.id || newId() });
        });
        return NextResponse.json(store);
      }

      case "deleteLaunch": {
        const { id } = payload as { id: string };
        const store = await updateStore((s) => {
          s.launches = s.launches.filter((l) => l.id !== id);
        });
        return NextResponse.json(store);
      }

      case "saveSettings": {
        const settings = payload as Record<string, unknown>;
        const store = await updateStore((s) => {
          s.settings = { ...s.settings, ...settings };
        });
        return NextResponse.json(store);
      }

      case "deleteCreative": {
        const { id } = payload as { id: string };
        const store = await updateStore((s) => {
          s.creatives = s.creatives.filter((c) => c.id !== id);
        });
        return NextResponse.json(store);
      }

      case "deleteReport": {
        const { id } = payload as { id: string };
        const store = await updateStore((s) => {
          s.reports = s.reports.filter((r) => r.id !== id);
        });
        return NextResponse.json(store);
      }

      default:
        return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fallo al guardar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
