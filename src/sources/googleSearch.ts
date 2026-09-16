import { config } from "../config.js";
import { PUZZLE_FR_PRODUCT_URL_RE } from "../util.js";

const SEARCH_TIMEOUT_MS = 8000;

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
    const match = data.items?.find((item) => PUZZLE_FR_PRODUCT_URL_RE.test(item.link));
    return { url: match?.link, errored: false };
  } catch (err) {
    console.warn(`google cse: search failed for ${ean}:`, (err as Error).message);
    return { errored: true };
  }
}
