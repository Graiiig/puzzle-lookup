/**
 * Host allowlists for anything that fetches/renders an arbitrary URL
 * (debug routes, image proxy) — without one, those endpoints would be an
 * open SSRF proxy even behind the API key. Both are exact-match, deliberately
 * not a subdomain wildcard: the only image host actually used today is
 * puzzle.fr's CDN, data.puzzle.fr. Add a specific hostname here if another
 * one is needed rather than widening to a whole root domain — a subdomain
 * takeover of some unrelated, forgotten host under puzzle.fr/ean-search.org
 * should not automatically gain access to either endpoint.
 */
const EXACT_SEARCH_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "www.ean-search.org", "ean-search.org"]);
const EXACT_IMAGE_HOSTS = new Set(["data.puzzle.fr"]);

export function isAllowedSearchHost(hostname: string): boolean {
  return EXACT_SEARCH_HOSTS.has(hostname);
}

export function isAllowedImageHost(hostname: string): boolean {
  return EXACT_IMAGE_HOSTS.has(hostname);
}

function parseUrlWithCheck(raw: string, isAllowed: (hostname: string) => boolean): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(`scheme not allowed: ${url.protocol}`);
  }
  if (!isAllowed(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }
  return url;
}

export function parseAllowedSearchUrl(raw: string): URL {
  return parseUrlWithCheck(raw, isAllowedSearchHost);
}

export function parseAllowedImageUrl(raw: string): URL {
  return parseUrlWithCheck(raw, isAllowedImageHost);
}
