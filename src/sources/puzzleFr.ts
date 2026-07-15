import type { BrowserContext, Page } from "playwright";
import { config } from "../config.js";
import {
  extractBrandFromDescription,
  extractPieceCount,
  stripPuzzleFrSiteSuffix,
  upgradeToHttps,
} from "../util.js";
import type { LookupFound, SourceResult } from "../types.js";
import { jsonLdBrandName, jsonLdImageUrl, readProductJsonLd } from "./jsonld.js";

/**
 * puzzle.fr runs on PrestaShop. Product URLs follow a documented convention
 * (`some-slug.p<id>.html`), which we rely on instead of guessing CSS classes
 * for the search results listing, since the exact theme markup could not be
 * verified from this environment (see README "Vérifier les sélecteurs").
 */
const PRODUCT_URL_RE = /\.p\d+\.html(?:[?#].*)?$/i;

function searchUrls(ean: string): string[] {
  const q = encodeURIComponent(ean);
  return [`https://www.puzzle.fr/recherche/${q}?src=1`];
}

/** Picks the first product link out of a rendered search results page. */
export async function pickProductUrl(page: Page): Promise<string | undefined> {
  const hrefs = await page.locator("a[href]").evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).href),
  );
  return hrefs.find((href) => PRODUCT_URL_RE.test(href));
}

interface ProductUrlOutcome {
  url?: string;
  /** True if at least one candidate URL failed to navigate (vs. loading fine and finding nothing). */
  errored: boolean;
}

async function findProductUrl(page: Page, ean: string): Promise<ProductUrlOutcome> {
  let errored = false;
  for (const url of searchUrls(ean)) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    } catch (err) {
      console.warn(`puzzle.fr: navigation to ${url} failed:`, (err as Error).message);
      errored = true;
      continue;
    }

    // A single matching product makes puzzle.fr redirect straight to it,
    // instead of showing a results listing with product links to scan.
    if (PRODUCT_URL_RE.test(page.url())) return { url: page.url(), errored };

    const productUrl = await pickProductUrl(page);
    if (productUrl) return { url: productUrl, errored };
  }
  return { errored };
}

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
    const page = await context.newPage();
    const found = await findProductUrl(page, ean);
    if (!found.url) {
      if (!found.errored) {
        console.warn(`puzzle.fr: no product link found for ${ean} (page loaded, no match)`);
      }
      return { found: false, errored: found.errored };
    }
    const productUrl = found.url;

    // A single-result search already redirects to this exact page — skip a
    // redundant second full navigation (product pages are image/script-heavy
    // enough that this alone can burn the whole per-source timeout budget).
    if (page.url() !== productUrl) {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    }

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
