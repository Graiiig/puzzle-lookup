/**
 * Shared host allowlist for anything that fetches/renders an arbitrary URL
 * (debug routes, image proxy) — without this, those endpoints would be an
 * open SSRF proxy even behind the API key. Matches the two scraped root
 * domains and any of their subdomains (e.g. puzzle.fr's image CDN,
 * data.puzzle.fr), not just the exact search-page hostnames.
 */
const ALLOWED_ROOT_DOMAINS = ["puzzle.fr", "ean-search.org"];

export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_ROOT_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function parseAllowedUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(`scheme not allowed: ${url.protocol}`);
  }
  if (!isAllowedHost(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }
  return url;
}
