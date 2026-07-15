/**
 * Host allowlists for anything that fetches/renders an arbitrary URL
 * (debug routes, image proxy) — without one, those endpoints would be an
 * open SSRF proxy even behind the API key. Both are exact-match, deliberately
 * not a subdomain wildcard: add a specific hostname here if another one is
 * needed rather than widening to a whole root domain — a subdomain takeover
 * of some unrelated, forgotten host under puzzle.fr/ean-search.org shouldn't
 * automatically gain access to either endpoint.
 *
 * Image hosts include both www.puzzle.fr (og:image/JSON-LD image can point
 * at the product page's own domain) and data.puzzle.fr (the asset CDN seen
 * on a real lookup) — extraction hasn't been observed to pin down exactly
 * one of these consistently, so both are allowed.
 */
const EXACT_SEARCH_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "www.ean-search.org", "ean-search.org"]);
const EXACT_IMAGE_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "data.puzzle.fr"]);

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
