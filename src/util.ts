/** Matches "1000 pieces", "1000pcs", "1000-pieces" etc. in a product name/slug. */
const PIECE_COUNT_RE = /(\d{2,5})\s*[-\s]?(?:pi[eè]ces?|pcs)\b/i;

export function extractPieceCount(text: string): number | undefined {
  const match = PIECE_COUNT_RE.exec(text);
  if (!match) return undefined;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * puzzle.fr's product meta description follows a stable template, e.g.
 * "Puzzle X de marque Trefl comprenant 6000 pièces à partir de ...".
 * More reliable than DOM selectors since it's SEO copy, not themed markup.
 */
const BRAND_FROM_DESCRIPTION_RE = /de marque\s+([^,.]+?)\s+comprenant\b/i;

export function extractBrandFromDescription(text: string): string | undefined {
  return BRAND_FROM_DESCRIPTION_RE.exec(text)?.[1]?.trim();
}

/** Strips the "- Puzzle.fr/..." site suffix from a <title> tag value. */
export function stripPuzzleFrSiteSuffix(title: string): string {
  return title.replace(/\s*-\s*Puzzle\.fr.*$/i, "").trim();
}

/**
 * Some image URLs come back as plain http (seen on puzzle.fr's og:image).
 * Consuming apps (the Android build especially, which blocks cleartext
 * traffic by default) need https, and CDNs serving images virtually always
 * support it too.
 */
export function upgradeToHttps(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * Philibert's image CDN paths carry an optional "-<format>" suffix after
 * the numeric id (e.g. "827348-cart_default", a small cart-thumbnail
 * variant) — the page's own og:image/JSON-LD points at this low-res
 * variant rather than the original. Dropping the suffix entirely (confirmed
 * on a real lookup: "827348-cart_default/..." -> "827348/...") lands on the
 * full-size image. Left untouched if the URL doesn't look like a Philibert
 * CDN path with a format suffix.
 */
const PHILIBERT_IMAGE_FORMAT_RE = /^(https:\/\/cdn1\.philibertnet\.com\/\d+)-[a-z_]+(\/.*)$/i;

export function stripPhilibertImageFormat(url: string): string {
  const match = PHILIBERT_IMAGE_FORMAT_RE.exec(url);
  return match ? `${match[1]}${match[2]}` : url;
}

/**
 * Races `promise` against a timer. Promise.race can't actually cancel the
 * loser, so `onTimeout` (typically closing the Playwright context driving
 * `promise`) is invoked when the timer wins, forcing the abandoned work to
 * reject instead of continuing to run in the background.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
