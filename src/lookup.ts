import { getCached, setCached } from "./cache.js";
import { config } from "./config.js";
import { searchEanSearch } from "./sources/eanSearch.js";
import { searchPuzzleFr } from "./sources/puzzleFr.js";
import type { LookupResult } from "./types.js";
import { withTimeout } from "./util.js";

const EAN_RE = /^\d{8,14}$/;

export function isValidEan(ean: string): boolean {
  return EAN_RE.test(ean);
}

async function tryOne(
  fn: (ean: string) => Promise<LookupResult | null>,
  ean: string,
  label: string,
): Promise<LookupResult | null> {
  try {
    return await withTimeout(fn(ean), config.sourceTimeoutMs, label);
  } catch (err) {
    console.warn(`${label} lookup failed for ${ean}:`, (err as Error).message);
    return null;
  }
}

export async function lookupEan(ean: string, options: { skipCache?: boolean } = {}): Promise<LookupResult> {
  if (!options.skipCache) {
    const cached = await getCached(ean);
    if (cached) return cached;
  }

  const result =
    (await tryOne(searchPuzzleFr, ean, "puzzle.fr")) ??
    (await tryOne(searchEanSearch, ean, "ean-search.org"));

  const final: LookupResult = result ?? { found: false };
  await setCached(ean, final);
  return final;
}
