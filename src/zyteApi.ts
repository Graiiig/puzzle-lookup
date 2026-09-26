import { config } from "./config.js";

const FETCH_TIMEOUT_MS = 20000; // Zyte does its own proxy rotation/retries under the hood, slower than a direct nav.

interface ZyteOutcome {
  html?: string;
  /** True on a request/config failure or a non-2xx from the target site itself — distinct from a clean fetch. */
  errored: boolean;
}

interface ZyteResponse {
  statusCode?: number;
  httpResponseBody?: string;
}

/**
 * Fetches a URL's HTML through Zyte's API (pay-as-you-go, no forced
 * monthly minimum — ~$0.13/1000 plain HTTP requests, a better fit for this
 * app's real volume than ScraperAPI's cheapest paid tier at $49/mo once its
 * one-time signup trial credits ran out) instead of directly with this
 * server's own Playwright browser. puzzle.fr's own IP-reputation-based
 * blocking (silently stalls the connection rather than returning a fast
 * error, making it harder to detect) made direct navigation from this
 * server's fixed datacenter IP unreliable regardless of stealth-context
 * tuning: the exact page that timed out from here loaded instantly in a
 * normal browser. Zyte's proxy pool isn't tied to this server's IP, so it
 * isn't subject to the same block.
 */
export async function fetchViaZyteApi(url: string): Promise<ZyteOutcome> {
  if (!config.zyteApiKey) {
    console.warn("zyte: ZYTE_API_KEY not configured, skipping");
    return { errored: true };
  }

  try {
    const res = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
        // HTTP Basic auth: API key as username, empty password.
        Authorization: `Basic ${Buffer.from(`${config.zyteApiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, httpResponseBody: true }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`zyte: fetch failed for ${url}: HTTP ${res.status}`);
      return { errored: true };
    }
    const data = (await res.json()) as ZyteResponse;
    // statusCode here is the *target site's* response status, not Zyte's own
    // (that's res.status above) — a blocked/errored fetch from puzzle.fr's
    // end would otherwise come back as a "successful" Zyte call carrying a
    // block page, the same class of false positive already hit on other
    // sources that skipped this check.
    if (!data.statusCode || data.statusCode < 200 || data.statusCode >= 300) {
      console.warn(`zyte: target responded ${data.statusCode} for ${url}`);
      return { errored: true };
    }
    if (!data.httpResponseBody) {
      console.warn(`zyte: no httpResponseBody for ${url}`);
      return { errored: true };
    }
    return { html: Buffer.from(data.httpResponseBody, "base64").toString("utf8"), errored: false };
  } catch (err) {
    console.warn(`zyte: fetch failed for ${url}:`, (err as Error).message);
    return { errored: true };
  }
}
