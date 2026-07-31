import { promises as fs } from "node:fs";
import path from "node:path";
import type { Store } from "./types";

const DIR = path.join(process.cwd(), "data");
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
