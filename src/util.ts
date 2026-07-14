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

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
