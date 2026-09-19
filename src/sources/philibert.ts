import type { BrowserContext } from "playwright";
import { config } from "../config.js";
import type { SourceResult } from "../types.js";
import { stripPhilibertImageFormat } from "../util.js";
import { extractGenericProduct } from "./genericProductExtract.js";
import { findProductUrlViaSerper } from "./serperSearch.js";

const PHILIBERT_HOSTS = new Set(["www.philibertnet.com", "philibertnet.com"]);

/**
 * Philibert (philibertnet.com), a French board-game/puzzle specialist —
 * a second scraped source alongside puzzle.fr, for catalog coverage
 * puzzle.fr doesn't have. Confirmed working end-to-end in prod.
 *
 * Uses direct Playwright navigation rather than routing through
 * ScraperAPI like puzzle.fr's product-page fetch does — puzzle.fr only
 * needed that after prod testing showed this server's IP got silently
 * stalled specifically on its product pages; direct navigation has worked
 * fine here so far. Revisit if that changes.
 */
export async function searchPhilibert(ean: string, context: BrowserContext): Promise<SourceResult> {
  try {
    const found = await findProductUrlViaSerper(ean, ["philibertnet.com"], PHILIBERT_HOSTS);
    if (found.urls.length === 0) {
      if (!found.errored) {
        console.warn(`philibert: no product found via Serper for ${ean}`);
      }
      return { found: false, errored: found.errored };
    }

    let anyCandidateFailed = false;
    for (const productUrl of found.urls) {
      const page = await context.newPage();
      const response = await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
      // page.goto() doesn't throw on a non-2xx response — a bot-blocked
      // request would otherwise fall through to extraction and could pick up
      // a block page's own generic content as if it were product data (seen
      // in prod on a different source: a bare "403" <title> read as a name).
      if (!response || !response.ok()) {
        console.warn(`philibert: blocked or errored for ${ean} (HTTP ${response?.status()})`);
        anyCandidateFailed = true;
        continue;
      }
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

      const extracted = await extractGenericProduct(page, productUrl, {
        source: "philibertnet.com",
        transformImageUrl: stripPhilibertImageFormat,
      });
      if (extracted) return extracted;
      console.warn(`philibert: found ${productUrl} for ${ean} but couldn't extract a name from it`);
      anyCandidateFailed = true;
    }
    return { found: false, errored: anyCandidateFailed };
  } catch (err) {
    console.warn(`philibert: scrape failed for ${ean}:`, (err as Error).message);
    return { found: false, errored: true };
  }
}
