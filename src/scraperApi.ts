import { config } from "./config.js";

const FETCH_TIMEOUT_MS = 20000; // ScraperAPI does its own proxy rotation/retries under the hood, slower than a direct nav.

interface ScraperApiOutcome {
  html?: string;
  /** True on a request/config failure — distinct from a clean non-2xx (page genuinely gone). */
  errored: boolean;
}

/**
 * Fetches a URL's rendered HTML through ScraperAPI instead of directly with
 * this server's own Playwright browser. puzzle.fr's own IP-reputation-based
 * blocking (silently stalls the connection rather than a fast 403 — same
 * class of problem as ean-search.org's explicit "Access denied", just
 * harder to detect) made direct navigation from this server's fixed
 * datacenter IP unreliable regardless of stealth-context tuning: the exact
 * page that timed out from here loaded instantly in a normal browser.
 * ScraperAPI's rotating proxy pool isn't tied to this server's IP, so it
 * isn't subject to the same block.
 */
export async function fetchViaScraperApi(url: string): Promise<ScraperApiOutcome> {
  if (!config.scraperApiKey) {
    console.warn("scraperapi: SCRAPERAPI_KEY not configured, skipping");
    return { errored: true };
  }

  const params = new URLSearchParams({
    api_key: config.scraperApiKey,
    url,
    country_code: "fr",
  });

  try {
    const res = await fetch(`https://api.scraperapi.com/?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`scraperapi: fetch failed for ${url}: HTTP ${res.status}`);
      return { errored: true };
    }
    return { html: await res.text(), errored: false };
  } catch (err) {
    console.warn(`scraperapi: fetch failed for ${url}:`, (err as Error).message);
    return { errored: true };
  }
}
