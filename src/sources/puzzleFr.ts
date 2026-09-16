import type { BrowserContext, Page } from "playwright";
import { fetchViaScraperApi } from "../scraperApi.js";
import {
  extractBrandFromDescription,
  extractPieceCount,
  stripPuzzleFrSiteSuffix,
  upgradeToHttps,
} from "../util.js";
import type { LookupFound, SourceResult } from "../types.js";
import { findPuzzleFrProductUrl } from "./serperSearch.js";
import { jsonLdBrandName, jsonLdImageUrl, readProductJsonLd } from "./jsonld.js";

/** Extracts product fields from an already-loaded product page. */
export async function extractProduct(page: Page, productUrl: string): Promise<LookupFound | null> {
  const product = await readProductJsonLd(page);
  const ogTitle = await page
    .locator('meta[property="og:title"]')
    .first()
    .getAttribute("content", { timeout: 2000 })
    .catch(() => null);
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .first()
    .getAttribute("content", { timeout: 2000 })
    .catch(() => null);
  const description = await page
    .locator('meta[name="description"]')
    .first()
    .getAttribute("content", { timeout: 2000 })
    .catch(() => null);
  const pageTitle = await page.title().catch(() => "");

  const name =
    product?.name ?? ogTitle ?? (pageTitle ? stripPuzzleFrSiteSuffix(pageTitle) : undefined) ?? undefined;
  if (!name) return null;

  const rawImageUrl = (product ? jsonLdImageUrl(product) : undefined) ?? ogImage ?? undefined;
  const imageUrl = rawImageUrl ? upgradeToHttps(rawImageUrl) : undefined;
  const brand =
    (product ? jsonLdBrandName(product) : undefined) ??
    (description ? extractBrandFromDescription(description) : undefined);
  const pieces =
    extractPieceCount(name) ?? extractPieceCount(productUrl) ?? (description ? extractPieceCount(description) : undefined);

  return {
    found: true,
    source: "puzzle.fr",
    brand,
    name,
    pieces,
    imageUrl,
  };
}

/**
 * Takes an already-created context rather than making its own, so the
 * caller (lookup.ts's tryOne) can force-close it on timeout and actually
 * cancel an in-flight scrape instead of leaving it running in the background.
 */
export async function searchPuzzleFr(ean: string, context: BrowserContext): Promise<SourceResult> {
  try {
    const found = await findPuzzleFrProductUrl(ean);
    if (!found.url) {
      if (!found.errored) {
        console.warn(`puzzle.fr: no product found via Serper for ${ean}`);
      }
      return { found: false, errored: found.errored };
    }
    const productUrl = found.url;

    // Fetched through ScraperAPI's proxy pool rather than a direct
    // page.goto() from this server — see fetchViaScraperApi's doc comment
    // for why (this exact class of URL silently stalls when navigated to
    // directly, despite loading instantly in a normal browser).
    const fetched = await fetchViaScraperApi(productUrl);
    if (!fetched.html) {
      console.warn(`puzzle.fr: couldn't fetch ${productUrl} via ScraperAPI for ${ean}`);
      return { found: false, errored: true };
    }

    const page = await context.newPage();
    await page.setContent(fetched.html, { waitUntil: "domcontentloaded" });

    const extracted = await extractProduct(page, productUrl);
    if (extracted) return extracted;
    // We already confirmed a product page exists at productUrl — failing to
    // extract anything from it (bot-check interstitial, slow render,
    // selector/markup change) is an anomaly, not a genuine "no such
    // product", and shouldn't get the long negative-miss TTL.
    console.warn(`puzzle.fr: found ${productUrl} for ${ean} but couldn't extract a name from it`);
    return { found: false, errored: true };
  } catch (err) {
    console.warn(`puzzle.fr: scrape failed for ${ean}:`, (err as Error).message);
    return { found: false, errored: true };
  }
}
