import type { Page } from "playwright";
import { extractPieceCount, upgradeToHttps } from "../util.js";
import type { LookupFound, LookupSource } from "../types.js";
import { jsonLdBrandName, jsonLdImageUrl, readProductJsonLd } from "./jsonld.js";

export interface GenericExtractOptions {
  source: LookupSource;
  /** Cleans a site's own name/suffix out of a raw <title> tag value, e.g. " - Puzzle.fr". */
  stripTitleSuffix?: (title: string) => string;
  /** Site-specific fallback for reading the brand out of the meta description, when JSON-LD has none. */
  brandFromDescription?: (description: string) => string | undefined;
  /** Site-specific cleanup of the resolved image URL, e.g. swapping a low-res thumbnail variant for the original. */
  transformImageUrl?: (url: string) => string;
}

/**
 * Extracts product fields from an already-loaded product page, shared
 * across every scraped source: JSON-LD `schema.org/Product` first (most
 * e-commerce platforms emit this for SEO rich snippets — more stable than
 * CSS selectors that change with the theme), falling back to `og:title`/
 * `og:image`, then the `<title>` tag and meta description.
 */
export async function extractGenericProduct(
  page: Page,
  productUrl: string,
  options: GenericExtractOptions,
): Promise<LookupFound | null> {
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
    product?.name ??
    ogTitle ??
    (pageTitle ? (options.stripTitleSuffix?.(pageTitle) ?? pageTitle) : undefined) ??
    undefined;
  if (!name) return null;

  const rawImageUrl = (product ? jsonLdImageUrl(product) : undefined) ?? ogImage ?? undefined;
  const imageUrl = rawImageUrl
    ? (options.transformImageUrl?.(upgradeToHttps(rawImageUrl)) ?? upgradeToHttps(rawImageUrl))
    : undefined;
  const brand =
    (product ? jsonLdBrandName(product) : undefined) ??
    (description ? options.brandFromDescription?.(description) : undefined);
  const pieces =
    extractPieceCount(name) ?? extractPieceCount(productUrl) ?? (description ? extractPieceCount(description) : undefined);

  return {
    found: true,
    source: options.source,
    brand,
    name,
    pieces,
    imageUrl,
  };
}
