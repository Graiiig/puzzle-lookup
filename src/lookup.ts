import type { BrowserContext } from "playwright";
import { newStealthContext } from "./browser.js";
import { getCached, setCached } from "./cache.js";
import { config } from "./config.js";
import { searchEanSearch } from "./sources/eanSearch.js";
import { searchPuzzleFr } from "./sources/puzzleFr.js";
import type { LookupResult, SourceResult } from "./types.js";
import { withTimeout } from "./util.js";

const EAN_RE = /^\d{8,14}$/;

export function isValidEan(ean: string): boolean {
  return EAN_RE.test(ean);
}

async function tryOne(
  fn: (ean: string, context: BrowserContext) => Promise<SourceResult>,
  ean: string,
  label: string,
): Promise<SourceResult> {
  const context = await newStealthContext();
  try {
    return await withTimeout(fn(ean, context), config.sourceTimeoutMs, label, () => {
      context.close().catch(() => {});
    });
  } catch (err) {
    console.warn(`${label} lookup failed for ${ean}:`, (err as Error).message);
    return { found: false, errored: true };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function lookupEan(ean: string, options: { skipCache?: boolean } = {}): Promise<LookupResult> {
  if (!options.skipCache) {
    const cached = await getCached(ean);
    if (cached) return cached;
  }

  const puzzleFr = await tryOne(searchPuzzleFr, ean, "puzzle.fr");
  if (puzzleFr.found) {
    await setCached(ean, puzzleFr, config.positiveTtlMs);
    return puzzleFr;
  }

  const eanSearch = await tryOne(searchEanSearch, ean, "ean-search.org");
  if (eanSearch.found) {
    await setCached(ean, eanSearch, config.positiveTtlMs);
    return eanSearch;
  }

  const final: LookupResult = { found: false };
  // A source erroring (timeout/exception) isn't the same as it cleanly
  // determining "not found" — cache the former only briefly so a permanent
  // breakage doesn't re-scrape both sites on every single request, without
  // locking in a false negative for the full negative TTL like a genuine
  // miss gets.
  const anyErrored = puzzleFr.errored || eanSearch.errored;
  await setCached(ean, final, anyErrored ? config.errorTtlMs : config.negativeTtlMs);
  return final;
}
