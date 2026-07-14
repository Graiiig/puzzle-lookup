import type { FastifyInstance } from "fastify";
import { isAllowedImageHost, parseAllowedImageUrl } from "./allowedHosts.js";
import { requireApiKey } from "./auth.js";

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB — a product photo has no business being bigger.

/**
 * Proxies an image from puzzle.fr/ean-search.org through this server, so the
 * frontend can fetch() it without depending on that third-party host sending
 * CORS headers of its own (it generally won't — those hosts were never
 * designed to be fetched cross-origin from a browser app).
 */
export function registerImageProxyRoute(app: FastifyInstance): void {
  app.get("/image", { preHandler: requireApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) return reply.code(400).send({ error: "missing 'url' query parameter" });

    let target: URL;
    try {
      target = parseAllowedImageUrl(url);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    try {
      const upstream = await fetch(target.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!upstream.ok || !upstream.body) {
        return reply.code(502).send({ error: `upstream responded ${upstream.status}` });
      }

      // fetch() follows redirects by default — re-check where we actually
      // ended up, the same way debug.ts re-checks page.url() after
      // navigation, so an allowed host redirecting elsewhere can't turn
      // this into an open proxy.
      const finalHost = new URL(upstream.url).hostname;
      if (!isAllowedImageHost(finalHost)) {
        return reply.code(502).send({ error: `redirected outside allowed hosts: ${finalHost}` });
      }

      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        return reply.code(502).send({ error: `unexpected content-type: ${contentType}` });
      }
      const contentLength = Number(upstream.headers.get("content-length") ?? "0");
      if (contentLength > MAX_BYTES) {
        return reply.code(502).send({ error: "image too large" });
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) {
        return reply.code(502).send({ error: "image too large" });
      }
      return reply.type(contentType).send(bytes);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
