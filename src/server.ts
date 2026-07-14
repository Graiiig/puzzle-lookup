import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { requireApiKey } from "./auth.js";
import { config } from "./config.js";
import { registerDebugRoutes } from "./debug.js";
import { isValidEan, lookupEan } from "./lookup.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.allowedOrigins,
    methods: ["GET"],
    allowedHeaders: ["x-api-key", "content-type"],
  });

  app.get("/health", async () => ({ ok: true }));

  registerDebugRoutes(app);

  app.get(
    "/lookup",
    { preHandler: requireApiKey },
    async (request, reply) => {
      const { ean, refresh } = request.query as { ean?: string; refresh?: string };
      if (!ean || !isValidEan(ean)) {
        return reply.code(400).send({ error: "invalid or missing 'ean' query parameter" });
      }

      const result = await lookupEan(ean, { skipCache: refresh === "1" });
      return reply.send(result);
    },
  );

  return app;
}
