import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { LookupResult } from "./types.js";

interface CacheEntry {
  result: LookupResult;
  expiresAt: number;
}

type CacheFile = Record<string, CacheEntry>;

const store = new Map<string, CacheEntry>();
let loadPromise: Promise<void> | null = null;

/** Memoizes the in-flight load so concurrent callers await the same read
 * instead of each seeing an empty store before it completes. */
function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
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
    })();
  }
  return loadPromise;
}

let tmpFileCounter = 0;

/** Writes via a temp file + rename so a crash mid-write can't corrupt the cache file.
 * The tmp path is unique per call (not just per process) so concurrent persist()
 * calls in the same process can't collide on the same file. */
async function persist(): Promise<void> {
  const obj: CacheFile = Object.fromEntries(store.entries());
  const dir = path.dirname(config.cacheFilePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${config.cacheFilePath}.${process.pid}-${tmpFileCounter++}.tmp`;
  await writeFile(tmpPath, JSON.stringify(obj), "utf8");
  await rename(tmpPath, config.cacheFilePath);
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

export async function setCached(ean: string, result: LookupResult, ttlMs: number): Promise<void> {
  await load();
  store.set(ean, { result, expiresAt: Date.now() + ttlMs });
  try {
    await persist();
  } catch (err) {
    console.warn("Failed to persist cache file:", err);
  }
}
