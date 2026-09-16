import { config } from "../config.js";

const SEARCH_TIMEOUT_MS = 8000;

interface SerperOutcome {
  url?: string;
  /** True on a request/config failure — distinct from a clean zero-result search. */
  errored: boolean;
}

interface SerperResponse {
  organic?: { link: string }[];
}

// puzzle.fr product URLs have carried more than one format in the wild
// (`some-slug.p<id>.html` and `/product/show/<slug>`, seen back to back on
// the same product a day apart) — trust the top hit for a site-restricted,
// EAN-exact query rather than filtering by URL shape, and just re-check the
// hostname as a defense-in-depth guard before ever navigating a browser
// there (the API response is external input).
const PUZZLE_FR_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr"]);

/**
 * Locates a puzzle.fr product page for an EAN via Serper (a third-party
 * proxy over real Google search results, https://serper.dev) instead of
 * puzzle.fr's own search, which doesn't index products by EAN at all
 * (confirmed: a valid EAN of a long-listed product returns 0 results
 * there). The EAN is printed in every product's spec table, so Google has
 * it indexed.
 *
 * Google's own Custom Search JSON API would have been the first choice
 * here, but it's closed to new projects since 2025 (fully shutting down
 * Jan 2027) — Serper is a paid third party standing in front of real
 * Google results, not an official Google product. Free tier is generous
 * enough (thousands of searches) that this app's volume (a handful of new
 * puzzles a month, everything else served from the 30-day cache) should
 * never actually be billed.
 */
export async function findPuzzleFrProductUrl(ean: string): Promise<SerperOutcome> {
  if (!config.serperApiKey) {
    console.warn("serper: SERPER_API_KEY not configured, skipping puzzle.fr lookup");
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
      body: JSON.stringify({ q: `site:puzzle.fr ${ean}` }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`serper: search failed for ${ean}: HTTP ${res.status}`);
      return { errored: true };
    }
    const data = (await res.json()) as SerperResponse;
    const match = data.organic?.find((item) => {
      try {
        return PUZZLE_FR_HOSTS.has(new URL(item.link).hostname);
      } catch {
        return false;
      }
    });
    return { url: match?.link, errored: false };
  } catch (err) {
    console.warn(`serper: search failed for ${ean}:`, (err as Error).message);
    return { errored: true };
  }
}
