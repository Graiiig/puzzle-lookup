import path from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intFromEnv("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  apiKey: process.env.API_KEY ?? "",
  cacheFilePath: process.env.CACHE_FILE_PATH ?? path.join(process.cwd(), "data", "cache.json"),
  sourceTimeoutMs: intFromEnv("SOURCE_TIMEOUT_MS", 15000),
  positiveTtlMs: intFromEnv("POSITIVE_CACHE_TTL_DAYS", 30) * 86_400_000,
  negativeTtlMs: intFromEnv("NEGATIVE_CACHE_TTL_HOURS", 24) * 3_600_000,
};

export function assertConfig(): void {
  if (!config.apiKey) {
    throw new Error(
      "API_KEY is not set. Define it in the environment (see .env.example) before starting the server.",
    );
  }
}
