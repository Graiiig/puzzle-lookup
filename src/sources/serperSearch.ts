import { config } from "../config.js";

const SEARCH_TIMEOUT_MS = 8000;

export interface SerperOutcome {
  /** Every organic result on an allowed host, in Serper's ranking order — not just the first, so a caller can fall through to the next candidate if one turns out blocked/broken. */
  urls: string[];
  /** True on a request/config failure — distinct from a clean non-2xx (page genuinely gone). */
  errored: boolean;
}

interface SerperResponse {
  organic?: { link: string }[];
}

function siteFilter(sites: string[]): string {
  if (sites.length === 1) return `site:${sites[0]}`;
  return `(${sites.map((s) => `site:${s}`).join(" OR ")})`;
}

/**
 * Locates candidate product pages for an EAN on one of `sites` via Serper
 * (a third-party proxy over real Google search results, https://serper.dev)
 * instead of those sites' own search — puzzle.fr's on-site search doesn't
 * index products by EAN at all (confirmed: a valid EAN of a long-listed
 * product returns 0 results there), and there's no reason to assume another
 * site's search fares any better. The EAN is typically printed somewhere on
 * a product's own page (spec table, URL slug), so Google has it indexed.
 *
 * Passing more than one site ORs them into a single query/request instead
 * of one call per site — useful for a broad catalog-coverage net across
 * many retailers that each individually carry only some products, without
 * paying for (and waiting on) a separate Serper call per retailer. Returns
 * every matching result, not just the top one: confirmed in prod that a
 * multi-site query can come back with only one matching retailer in the
 * results at all — if a caller only ever tries the first candidate and
 * that one retailer happens to be blocking requests, the whole tier fails
 * even though a different candidate further down might have worked fine.
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
 * Google) response, not from `sites` itself, and a shape-based URL filter
 * proved too brittle in practice (puzzle.fr alone has used more than one
 * product URL format).
 */
export async function findProductUrlViaSerper(
  ean: string,
  sites: string[],
  allowedHosts: Set<string>,
): Promise<SerperOutcome> {
  if (!config.serperApiKey) {
    console.warn(`serper: SERPER_API_KEY not configured, skipping lookup on ${sites.join(", ")}`);
    return { urls: [], errored: true };
  }

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": config.serperApiKey,
        "Content-Type": "application/json",
      },
      // Serper has no dedicated site-restriction field — it mirrors a real
      // Google search, so the site: operator(s) go straight in the query text.
      body: JSON.stringify({ q: `${siteFilter(sites)} ${ean}`, num: 10 }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`serper: search failed for ${ean} on ${sites.join(", ")}: HTTP ${res.status}`);
      return { urls: [], errored: true };
    }
    const data = (await res.json()) as SerperResponse;
    const urls = (data.organic ?? [])
      .filter((item) => {
        try {
          return allowedHosts.has(new URL(item.link).hostname);
        } catch {
          return false;
        }
      })
      .map((item) => item.link);
    return { urls, errored: false };
  } catch (err) {
    console.warn(`serper: search failed for ${ean} on ${sites.join(", ")}:`, (err as Error).message);
    return { urls: [], errored: true };
  }
}
