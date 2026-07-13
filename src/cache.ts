import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { LookupResult } from "./types.js";

interface CacheEntry {
  result: LookupResult;
  expiresAt: number;
}

type CacheFile = Record<string, CacheEntry>;

const store = new Map<string, CacheEntry>();
let loaded = false;
let writeQueue: Promise<unknown> = Promise.resolve();

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await readFile(config.cacheFilePath, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    const now = Date.now();
    for (const [ean, entry] of Object.entries(parsed)) {
      if (entry.expiresAt > now) store.set(ean, entry);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to load cache file, starting empty:", err);
    }
  }
}

function persist(): void {
  writeQueue = writeQueue
    .then(async () => {
      const obj: CacheFile = Object.fromEntries(store.entries());
      await mkdir(path.dirname(config.cacheFilePath), { recursive: true });
      await writeFile(config.cacheFilePath, JSON.stringify(obj), "utf8");
    })
    .catch((err) => {
      console.warn("Failed to persist cache file:", err);
    });
}

export async function getCached(ean: string): Promise<LookupResult | undefined> {
  await load();
  const entry = store.get(ean);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(ean);
    return undefined;
  }
  return entry.result;
}

export async function setCached(ean: string, result: LookupResult): Promise<void> {
  await load();
  const ttl = result.found ? config.positiveTtlMs : config.negativeTtlMs;
  store.set(ean, { result, expiresAt: Date.now() + ttl });
  persist();
}
