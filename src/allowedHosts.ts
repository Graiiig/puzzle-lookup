import { FR_RETAILER_HOSTS } from "./sources/frRetailers.js";

/**
 * Host allowlists for anything that fetches/renders an arbitrary URL
 * (debug routes, image proxy) — without one, those endpoints would be an
 * open SSRF proxy even behind the API key. Both are exact-match, deliberately
 * not a subdomain wildcard: add a specific hostname here if another one is
 * needed rather than widening to a whole root domain — a subdomain takeover
 * of some unrelated, forgotten host under any of these sites shouldn't
 * automatically gain access to either endpoint.
 *
 * Image hosts include both a site's main domain (og:image/JSON-LD image can
 * point at the product page's own domain) and its separate asset CDN, where
 * one is known — data.puzzle.fr and cdn1.philibertnet.com, both confirmed
 * on real lookups — since extraction hasn't been observed to pin down
 * exactly one of these consistently per site. The FR retailer hosts (see
 * frRetailers.ts) don't have a known separate asset CDN yet — add one here
 * if a real lookup turns one up, the same way puzzle.fr/Philibert's were.
 */
const EXACT_SEARCH_HOSTS = new Set([
  "www.puzzle.fr",
  "puzzle.fr",
  "www.philibertnet.com",
  "philibertnet.com",
  ...FR_RETAILER_HOSTS,
]);
const EXACT_IMAGE_HOSTS = new Set([
  "www.puzzle.fr",
  "puzzle.fr",
  "data.puzzle.fr",
  "www.philibertnet.com",
  "cdn1.philibertnet.com",
  ...FR_RETAILER_HOSTS,
]);

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
