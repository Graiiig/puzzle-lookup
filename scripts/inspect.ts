/**
 * Manual tuning helper: opens a real (non-headless) browser on a given URL,
 * saves a screenshot + the rendered HTML to ./debug, so selectors in
 * src/sources/*.ts can be verified/adjusted against the live site.
 *
 * Usage:
 *   npm run inspect -- "https://www.puzzle.fr/recherche/1234567890123?src=1"
 *   npm run inspect -- "https://www.ean-search.org/?q=1234567890123"
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { REALISTIC_USER_AGENT } from "../src/browser.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run inspect -- <url>");
  process.exit(1);
}

await mkdir("debug", { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: REALISTIC_USER_AGENT,
  viewport: { width: 1366, height: 900 },
  locale: "fr-FR",
});
const page = await context.newPage();

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

const html = await page.content();
await writeFile("debug/page.html", html, "utf8");
await page.screenshot({ path: "debug/page.png", fullPage: true });

console.log("Saved debug/page.html and debug/page.png");
console.log("Inspect the HTML/screenshot, then update the selectors in src/sources/*.ts");

await browser.close();
