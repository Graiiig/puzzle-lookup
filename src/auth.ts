import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const provided = request.headers["x-api-key"];
  if (typeof provided !== "string" || !safeEqual(provided, config.apiKey)) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
