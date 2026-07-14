import type { BrowserContext } from "playwright";
import { newStealthContext } from "./browser.js";
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

interface SourceAttempt {
  result: LookupResult | null;
  /** True if the source errored/timed out rather than cleanly resolving. */
  errored: boolean;
}

async function tryOne(
  fn: (ean: string, context: BrowserContext) => Promise<LookupResult | null>,
  ean: string,
  label: string,
): Promise<SourceAttempt> {
  const context = await newStealthContext();
  try {
    const result = await withTimeout(fn(ean, context), config.sourceTimeoutMs, label, () => {
      context.close().catch(() => {});
    });
    return { result, errored: false };
  } catch (err) {
    console.warn(`${label} lookup failed for ${ean}:`, (err as Error).message);
    return { result: null, errored: true };
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
  if (puzzleFr.result) {
    await setCached(ean, puzzleFr.result, config.positiveTtlMs);
    return puzzleFr.result;
  }

  const eanSearch = await tryOne(searchEanSearch, ean, "ean-search.org");
  if (eanSearch.result) {
    await setCached(ean, eanSearch.result, config.positiveTtlMs);
    return eanSearch.result;
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
