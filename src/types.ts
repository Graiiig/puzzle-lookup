export type LookupSource = "puzzle.fr" | "ean-search.org";

export interface LookupFound {
  found: true;
  source: LookupSource;
  brand?: string;
  name: string;
  pieces?: number;
  imageUrl?: string;
  vendorUrl?: string;
}

export interface LookupNotFound {
  found: false;
}

export type LookupResult = LookupFound | LookupNotFound;

/**
 * Internal contract between a source scraper and lookup.ts — never returned
 * from the HTTP API as-is (lookup.ts strips `errored` before responding).
 * Distinguishes "cleanly determined not found" from "an error/timeout
 * happened", so a transient failure can get a short cache TTL instead of
 * being indistinguishable from — and cached as long as — a genuine miss.
 */
export type SourceResult = LookupFound | { found: false; errored: boolean };
