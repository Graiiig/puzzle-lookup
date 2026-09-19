import type { BrowserContext, Page } from "playwright";
import { fetchViaScraperApi } from "../scraperApi.js";
import { extractBrandFromDescription, stripPuzzleFrSiteSuffix } from "../util.js";
import type { LookupFound, SourceResult } from "../types.js";
import { extractGenericProduct } from "./genericProductExtract.js";
import { findProductUrlViaSerper } from "./serperSearch.js";

const PUZZLE_FR_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr"]);

/** Extracts product fields from an already-loaded product page. */
export async function extractProduct(page: Page, productUrl: string): Promise<LookupFound | null> {
  return extractGenericProduct(page, productUrl, {
    source: "puzzle.fr",
    stripTitleSuffix: stripPuzzleFrSiteSuffix,
    brandFromDescription: extractBrandFromDescription,
  });
}

/**
 * Takes an already-created context rather than making its own, so the
 * caller (lookup.ts's tryOne) can force-close it on timeout and actually
 * cancel an in-flight scrape instead of leaving it running in the background.
 */
export async function searchPuzzleFr(ean: string, context: BrowserContext): Promise<SourceResult> {
  try {
    const found = await findProductUrlViaSerper(ean, ["puzzle.fr"], PUZZLE_FR_HOSTS);
    if (found.urls.length === 0) {
      if (!found.errored) {
        console.warn(`puzzle.fr: no product found via Serper for ${ean}`);
      }
      return { found: false, errored: found.errored };
    }

    let anyCandidateFailed = false;
    for (const productUrl of found.urls) {
      // Fetched through ScraperAPI's proxy pool rather than a direct
      // page.goto() from this server — see fetchViaScraperApi's doc comment
      // for why (this exact class of URL silently stalls when navigated to
      // directly, despite loading instantly in a normal browser).
      const fetched = await fetchViaScraperApi(productUrl);
      if (!fetched.html) {
        console.warn(`puzzle.fr: couldn't fetch ${productUrl} via ScraperAPI for ${ean}`);
        anyCandidateFailed = true;
        continue;
      }

      const page = await context.newPage();
      await page.setContent(fetched.html, { waitUntil: "domcontentloaded" });

      const extracted = await extractProduct(page, productUrl);
      if (extracted) {
        console.log(`puzzle.fr: matched ${productUrl} for ${ean}`);
        return extracted;
      }
      // We already confirmed a product page exists at productUrl — failing to
      // extract anything from it (bot-check interstitial, slow render,
      // selector/markup change) is an anomaly, not a genuine "no such
      // product", and shouldn't get the long negative-miss TTL.
      console.warn(`puzzle.fr: found ${productUrl} for ${ean} but couldn't extract a name from it`);
      anyCandidateFailed = true;
    }
    return { found: false, errored: anyCandidateFailed };
  } catch (err) {
    console.warn(`puzzle.fr: scrape failed for ${ean}:`, (err as Error).message);
    return { found: false, errored: true };
  }
}
