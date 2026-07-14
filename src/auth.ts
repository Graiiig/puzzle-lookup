import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/**
 * Hashing both sides first means the timingSafeEqual inputs are always the
 * same length, so there's no length-mismatch fast path that would otherwise
 * leak the real key's length through response timing.
 */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const provided = request.headers["x-api-key"];
  if (typeof provided !== "string" || !safeEqual(provided, config.apiKey)) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
