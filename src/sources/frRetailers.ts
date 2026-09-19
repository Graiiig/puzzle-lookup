import type { BrowserContext } from "playwright";
import { config } from "../config.js";
import type { SourceResult } from "../types.js";
import { extractGenericProduct } from "./genericProductExtract.js";
import { findProductUrlViaSerper } from "./serperSearch.js";

/**
 * Curated French toy/puzzle retailers tried as one combined Serper search
 * (ORed site: clauses — see serperSearch.ts) rather than a dedicated
 * per-site source file each: puzzle.fr and Philibert cover a fair amount
 * between them, but plenty of puzzles (smaller/regional brands especially)
 * only turn up on generalist retailers like these. A single, generic,
 * growing list scales better than writing a new *.ts file per retailer —
 * add a domain here and its two host entries below, nothing else, as long
 * as the site has ordinary schema.org/og:meta markup for
 * extractGenericProduct to read (no per-site tuning like puzzle.fr's
 * ScraperAPI hop or Philibert's image-format fix).
 */
const FR_RETAILER_SITES = ["cultura.com", "joueclub.fr", "king-jouet.com", "e.leclerc", "bcd-jeux.fr"];

/** Exported for allowedHosts.ts, so the debug/image routes can also reach these sites without a second list to keep in sync. */
export const FR_RETAILER_HOSTS = new Set([
  "www.cultura.com",
  "cultura.com",
  "www.joueclub.fr",
  "joueclub.fr",
  "www.king-jouet.com",
  "king-jouet.com",
  "www.e.leclerc",
  "e.leclerc",
  "www.bcd-jeux.fr",
  "bcd-jeux.fr",
]);

/**
 * Broad-net fallback across FR_RETAILER_SITES, tried after puzzle.fr and
 * Philibert. UNVERIFIED against any of these real sites — this dev
 * environment can't reach them either (see README "Sélecteurs à
 * vérifier"). Uses direct Playwright navigation like Philibert (no
 * ScraperAPI) until/unless prod testing shows a given host needs it —
 * pre-emptively routing every one of these through ScraperAPI would just
 * be guessing which (if any) actually need it.
 */
export async function searchFrRetailers(ean: string, context: BrowserContext): Promise<SourceResult> {
  try {
    const found = await findProductUrlViaSerper(ean, FR_RETAILER_SITES, FR_RETAILER_HOSTS);
    if (!found.url) {
      if (!found.errored) {
        console.warn(`fr-retailers: no product found via Serper for ${ean}`);
      }
      return { found: false, errored: found.errored };
    }
    const productUrl = found.url;
    const source = new URL(productUrl).hostname;

    const page = await context.newPage();
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

    const extracted = await extractGenericProduct(page, productUrl, { source });
    if (extracted) return extracted;
    console.warn(`fr-retailers: found ${productUrl} for ${ean} but couldn't extract a name from it`);
    return { found: false, errored: true };
  } catch (err) {
    console.warn(`fr-retailers: scrape failed for ${ean}:`, (err as Error).message);
    return { found: false, errored: true };
  }
}
