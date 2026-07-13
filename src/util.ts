/** Matches "1000 pieces", "1000pcs", "1000-pieces" etc. in a product name/slug. */
const PIECE_COUNT_RE = /(\d{2,5})\s*[-\s]?(?:pi[eè]ces?|pcs)\b/i;

export function extractPieceCount(text: string): number | undefined {
  const match = PIECE_COUNT_RE.exec(text);
  if (!match) return undefined;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
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
