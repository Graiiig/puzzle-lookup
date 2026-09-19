/**
 * The hostname of whichever source actually answered. A plain string
 * rather than a fixed union: the broad-retailer-net source
 * (frRetailers.ts) covers a growing, curated list of sites and reports
 * back whichever one actually matched, dynamically — a fixed union would
 * need editing on every retailer added there.
 */
export type LookupSource = string;

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
