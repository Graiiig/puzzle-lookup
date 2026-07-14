import path from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://graiiig.github.io",
  "http://localhost:5173",
  "https://localhost",
];

export const config = {
  port: intFromEnv("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  apiKey: process.env.API_KEY ?? "",
  cacheFilePath: process.env.CACHE_FILE_PATH ?? path.join(process.cwd(), "data", "cache.json"),
  // Overall budget for one source's whole lookup (navigation + extraction).
  sourceTimeoutMs: intFromEnv("SOURCE_TIMEOUT_MS", 25000),
  // Budget for a single page.goto call; kept below sourceTimeoutMs so a
  // multi-navigation lookup (search page + product page) still fits inside
  // the overall per-source budget instead of racing against an identical one.
  navTimeoutMs: intFromEnv("NAV_TIMEOUT_MS", 10000),
  positiveTtlMs: intFromEnv("POSITIVE_CACHE_TTL_DAYS", 30) * 86_400_000,
  negativeTtlMs: intFromEnv("NEGATIVE_CACHE_TTL_HOURS", 24) * 3_600_000,
  // Short TTL for a "not found" that's actually a source error/timeout
  // rather than a confirmed miss — bounds re-scrape frequency without
  // locking in a false negative for a whole day.
  errorTtlMs: intFromEnv("ERROR_CACHE_TTL_MINUTES", 10) * 60_000,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function assertConfig(): void {
  if (!config.apiKey) {
    throw new Error(
      "API_KEY is not set. Define it in the environment (see .env.example) before starting the server.",
    );
  }
}
