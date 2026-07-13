import type { Page } from "playwright";
import { newStealthContext } from "../browser.js";
import { extractPieceCount } from "../util.js";
import type { LookupResult } from "../types.js";

/**
 * Best-effort selectors for ean-search.org's search results page. The exact
 * markup could not be verified from this environment (no outbound network
 * access to ean-search.org here) — see README "Vérifier les sélecteurs"
 * before relying on this in production.
 */
const RESULT_NAME_SELECTORS = [
  "table.resultTable td a",
  ".searchresults a",
  "#result a",
  "table a[href*='/prod']",
  "h1",
];

const NOISE_TEXT = new Set([
  "home",
  "login",
  "register",
  "search",
  "contact",
  "api",
  "about",
  "privacy",
]);

function looksLikeProductName(text: string | null): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 200) return false;
  return !NOISE_TEXT.has(trimmed.toLowerCase());
}

export async function findResultName(page: Page): Promise<string | undefined> {
  for (const selector of RESULT_NAME_SELECTORS) {
    const locator = page.locator(selector).first();
    const text = await locator.textContent({ timeout: 1500 }).catch(() => null);
    if (looksLikeProductName(text)) return text.trim();
  }
  const title = await page.title().catch(() => "");
  return looksLikeProductName(title) ? title.trim() : undefined;
}

export async function findVendorLink(page: Page): Promise<string | undefined> {
  const hrefs = await page
    .locator("a[href^='http']")
    .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href))
    .catch(() => [] as string[]);
  return hrefs.find((href) => !href.includes("ean-search.org"));
}

export async function searchEanSearch(ean: string): Promise<LookupResult | null> {
  const context = await newStealthContext();
  try {
    const page = await context.newPage();
    await page.goto(`https://www.ean-search.org/?q=${encodeURIComponent(ean)}`, {
      waitUntil: "domcontentloaded",
      timeout: 8000,
    });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

    const name = await findResultName(page);
    if (!name) return null;

    const vendorUrl = await findVendorLink(page);
    const pieces = extractPieceCount(name);

    return {
      found: true,
      source: "ean-search.org",
      name,
      pieces,
      vendorUrl,
    };
  } catch {
    return null;
  } finally {
    await context.close();
  }
}
