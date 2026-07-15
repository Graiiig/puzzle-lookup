import type { FastifyInstance } from "fastify";
import { Readable, Transform } from "node:stream";
import { isAllowedImageHost, parseAllowedImageUrl } from "./allowedHosts.js";
import { requireApiKey } from "./auth.js";

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB — a product photo has no business being bigger.

/** Passes chunks through unless the running total exceeds MAX_BYTES, in
 * which case it destroys the stream instead of buffering an unbounded
 * response (content-length can't be trusted alone: it's absent for some
 * chunked/compressed responses). */
function byteLimiter(maxBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new Error("image too large"));
        return;
      }
      callback(null, chunk);
    },
  });
}

/**
 * Proxies an image (only puzzle.fr today — ean-search.org's results never
 * carry an imageUrl, see allowedHosts.ts) through this server, so the
 * frontend can fetch() it without depending on that third-party host
 * sending CORS headers of its own (it generally won't — that host was
 * never designed to be fetched cross-origin from a browser app).
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

      // Streamed straight through with a hard byte cap enforced as it goes,
      // rather than buffering the whole response first — this way a large
      // or slow response is rejected without ever holding it all in memory.
      const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream<Uint8Array>);
      return reply.type(contentType).send(nodeStream.pipe(byteLimiter(MAX_BYTES)));
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
