import { config } from "../config.js";

const SEARCH_TIMEOUT_MS = 8000;

// puzzle.fr product URLs have carried more than one format in the wild
// (`some-slug.p<id>.html` and `/product/show/<slug>`, seen back to back on
// the same product a day apart) — a shape-based filter proved too brittle
// (it silently discarded a correct, Google-verified result). Trust the top
// hit for a site-restricted, EAN-exact query instead, and just re-check the
// hostname as a defense-in-depth guard before ever navigating a browser
// there (the API response is external input).
const PUZZLE_FR_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr"]);

interface GoogleCseOutcome {
  url?: string;
  /** True on a request/config failure — distinct from a clean zero-result search. */
  errored: boolean;
}

interface GoogleCseResponse {
  items?: { link: string }[];
}

/**
 * Locates a puzzle.fr product page for an EAN via Google's Custom Search
 * JSON API instead of puzzle.fr's own search, which doesn't index products
 * by EAN at all (confirmed: a valid EAN of a long-listed product returns 0
 * results there). The EAN is printed in every product's spec table, so
 * Google has it indexed. `siteSearch`/`siteSearchFilter` restrict results to
 * puzzle.fr regardless of how the Custom Search Engine itself is configured.
 *
 * Plain fetch() rather than a Playwright page — this is a JSON REST API, not
 * a page to render.
 */
export async function findPuzzleFrProductUrl(ean: string): Promise<GoogleCseOutcome> {
  if (!config.googleCseApiKey || !config.googleCseCx) {
    console.warn("google cse: GOOGLE_CSE_API_KEY/GOOGLE_CSE_CX not configured, skipping puzzle.fr lookup");
    return { errored: true };
  }

  const params = new URLSearchParams({
    key: config.googleCseApiKey,
    cx: config.googleCseCx,
    q: ean,
    siteSearch: "www.puzzle.fr",
    siteSearchFilter: "i",
    num: "5",
  });

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`google cse: search failed for ${ean}: HTTP ${res.status}`);
      return { errored: true };
    }
    const data = (await res.json()) as GoogleCseResponse;
    const match = data.items?.find((item) => {
      try {
        return PUZZLE_FR_HOSTS.has(new URL(item.link).hostname);
      } catch {
        return false;
      }
    });
    return { url: match?.link, errored: false };
  } catch (err) {
    console.warn(`google cse: search failed for ${ean}:`, (err as Error).message);
    return { errored: true };
  }
}
