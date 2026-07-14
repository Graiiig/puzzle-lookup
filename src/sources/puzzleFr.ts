import type { Page } from "playwright";
import { newStealthContext } from "../browser.js";
import {
  extractBrandFromDescription,
  extractPieceCount,
  stripPuzzleFrSiteSuffix,
} from "../util.js";
import type { LookupResult } from "../types.js";
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

async function findProductUrl(page: Page, ean: string): Promise<string | undefined> {
  for (const url of searchUrls(ean)) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    } catch {
      continue;
    }

    // A single matching product makes puzzle.fr redirect straight to it,
    // instead of showing a results listing with product links to scan.
    if (PRODUCT_URL_RE.test(page.url())) return page.url();

    const productUrl = await pickProductUrl(page);
    if (productUrl) return productUrl;
  }
  return undefined;
}

/** Extracts product fields from an already-loaded product page. */
export async function extractProduct(page: Page, productUrl: string): Promise<LookupResult | null> {
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

  const imageUrl = (product ? jsonLdImageUrl(product) : undefined) ?? ogImage ?? undefined;
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

export async function searchPuzzleFr(ean: string): Promise<LookupResult | null> {
  const context = await newStealthContext();
  try {
    const page = await context.newPage();
    const productUrl = await findProductUrl(page, ean);
    if (!productUrl) return null;

    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 8000 });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

    return await extractProduct(page, productUrl);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}
