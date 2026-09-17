import { config } from "../config.js";

const SEARCH_TIMEOUT_MS = 8000;

export interface SerperOutcome {
  url?: string;
  /** True on a request/config failure — distinct from a clean non-2xx (page genuinely gone). */
  errored: boolean;
}

interface SerperResponse {
  organic?: { link: string }[];
}

/**
 * Locates a product page for an EAN on `site` via Serper (a third-party
 * proxy over real Google search results, https://serper.dev) instead of
 * that site's own search — puzzle.fr's on-site search doesn't index
 * products by EAN at all (confirmed: a valid EAN of a long-listed product
 * returns 0 results there), and there's no reason to assume another site's
 * search fares any better. The EAN is typically printed somewhere on a
 * product's own page (spec table, URL slug), so Google has it indexed.
 *
 * Google's own Custom Search JSON API would have been the first choice
 * here, but it's closed to new projects since 2025 (fully shutting down
 * Jan 2027) — Serper is a paid third party standing in front of real
 * Google results, not an official Google product. Free tier is generous
 * enough (thousands of searches) that this app's volume (a handful of new
 * puzzles a month, everything else served from the 30-day cache) should
 * never actually be billed.
 *
 * `allowedHosts` is checked as defense-in-depth before a caller ever
 * navigates a browser to a result's URL — it comes from an external (Serper/
 * Google) response, not from `site` itself, and a shape-based URL filter
 * proved too brittle in practice (puzzle.fr alone has used more than one
 * product URL format).
 */
export async function findProductUrlViaSerper(
  ean: string,
  site: string,
  allowedHosts: Set<string>,
): Promise<SerperOutcome> {
  if (!config.serperApiKey) {
    console.warn(`serper: SERPER_API_KEY not configured, skipping ${site} lookup`);
    return { errored: true };
  }

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": config.serperApiKey,
        "Content-Type": "application/json",
      },
      // Serper has no dedicated site-restriction field — it mirrors a real
      // Google search, so the site: operator goes straight in the query text.
      body: JSON.stringify({ q: `site:${site} ${ean}` }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`serper: search failed for ${ean} on ${site}: HTTP ${res.status}`);
      return { errored: true };
    }
    const data = (await res.json()) as SerperResponse;
    const match = data.organic?.find((item) => {
      try {
        return allowedHosts.has(new URL(item.link).hostname);
      } catch {
        return false;
      }
    });
    return { url: match?.link, errored: false };
  } catch (err) {
    console.warn(`serper: search failed for ${ean} on ${site}:`, (err as Error).message);
    return { errored: true };
  }
}
