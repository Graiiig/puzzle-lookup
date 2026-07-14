/**
 * Host allowlists for anything that fetches/renders an arbitrary URL
 * (debug routes, image proxy) — without one, those endpoints would be an
 * open SSRF proxy even behind the API key. Two separate, differently-scoped
 * lists rather than one shared one: the debug routes render full pages with
 * a real browser (a much stronger primitive), so they stay pinned to the
 * exact search-page hostnames, while the image proxy only needs read access
 * to static image bytes and additionally needs subdomains (puzzle.fr's image
 * CDN is data.puzzle.fr). Broadening the debug routes' check to subdomains
 * too would let a takeover of any forgotten subdomain of either root domain
 * be rendered/screenshotted through this server, which the narrower check
 * never allowed.
 */
const EXACT_SEARCH_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "www.ean-search.org", "ean-search.org"]);
const IMAGE_ROOT_DOMAINS = ["puzzle.fr", "ean-search.org"];

export function isAllowedSearchHost(hostname: string): boolean {
  return EXACT_SEARCH_HOSTS.has(hostname);
}

export function isAllowedImageHost(hostname: string): boolean {
  return IMAGE_ROOT_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
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
