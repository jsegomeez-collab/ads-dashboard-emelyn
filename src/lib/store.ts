import { promises as fs } from "node:fs";
import path from "node:path";
import type { Store } from "./types";

/**
 * Where launches, creative analyses, and AI reports live. Locally this is just
 * `./data` inside the project. On Render (and most PaaS) the app's own
 * filesystem is wiped on every redeploy, so production must point DATA_DIR at
 * a mounted persistent disk instead — see render.yaml, which sets DATA_DIR to
 * the disk's mount path. Without a persistent disk, set DATA_DIR to it anyway
 * and the store simply won't survive a redeploy — better to know that than to
 * silently lose data.
 */
const DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const FILE = path.join(DIR, "store.json");

const DEFAULT_STORE: Store = {
  launches: [],
  creatives: [],
  reports: [],
  settings: { currency: "USD", monthlyOverhead: 0, targetCpl: null, targetRoas: null },
};

export async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      ...DEFAULT_STORE,
      ...parsed,
      settings: { ...DEFAULT_STORE.settings, ...(parsed.settings ?? {}) },
      launches: parsed.launches ?? [],
      creatives: parsed.creatives ?? [],
      reports: parsed.reports ?? [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_STORE };
    throw err;
  }
}

/**
 * Writes are serialised through a promise chain and land via a temp file +
 * rename, so a crash mid-write cannot leave a half-written store behind.
 */
let queue: Promise<unknown> = Promise.resolve();

export function writeStore(next: Store): Promise<void> {
  const task = queue.then(async () => {
    await fs.mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, FILE);
  });
  queue = task.catch(() => {});
  return task;
}

/** Read-modify-write under the same queue, so concurrent requests cannot clobber each other. */
export function updateStore(mutate: (s: Store) => void | Promise<void>): Promise<Store> {
  const task = queue.then(async () => {
    const current = await readStore();
    await mutate(current);
    await fs.mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(current, null, 2), "utf8");
    await fs.rename(tmp, FILE);
    return current;
  });
  queue = task.catch(() => {});
  return task;
}

export const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
