import Fastify, { type FastifyInstance } from "fastify";
import { requireApiKey } from "./auth.js";
import { registerDebugRoutes } from "./debug.js";
import { isValidEan, lookupEan } from "./lookup.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  registerDebugRoutes(app);

  app.get(
    "/lookup",
    { preHandler: requireApiKey },
    async (request, reply) => {
      const { ean } = request.query as { ean?: string };
      if (!ean || !isValidEan(ean)) {
        return reply.code(400).send({ error: "invalid or missing 'ean' query parameter" });
      }

      const result = await lookupEan(ean);
      return reply.send(result);
    },
  );

  return app;
}
