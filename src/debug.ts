import type { FastifyInstance } from "fastify";
import { requireApiKey } from "./auth.js";
import { newStealthContext } from "./browser.js";

/**
 * Restricted to the two scraped domains: these routes render arbitrary
 * URLs, so without an allowlist they'd be an open SSRF proxy (even behind
 * the API key).
 */
const ALLOWED_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "www.ean-search.org", "ean-search.org"]);

function parseAllowedUrl(raw: string): URL {
  const url = new URL(raw);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }
  return url;
}

/**
 * Manual tuning helper for environments (like this VPS) that have network
 * access to puzzle.fr/ean-search.org but no local Playwright setup. Same
 * purpose as scripts/inspect.ts, exposed over HTTP instead.
 */
export function registerDebugRoutes(app: FastifyInstance): void {
  app.get("/debug/html", { preHandler: requireApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) return reply.code(400).send({ error: "missing 'url' query parameter" });

    let target: URL;
    try {
      target = parseAllowedUrl(url);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    const context = await newStealthContext();
    try {
      const page = await context.newPage();
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const html = await page.content();
      return reply.type("text/html").send(html);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    } finally {
      await context.close();
    }
  });

  app.get("/debug/screenshot", { preHandler: requireApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) return reply.code(400).send({ error: "missing 'url' query parameter" });

    let target: URL;
    try {
      target = parseAllowedUrl(url);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    const context = await newStealthContext();
    try {
      const page = await context.newPage();
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const buffer = await page.screenshot({ fullPage: true });
      return reply.type("image/png").send(buffer);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    } finally {
      await context.close();
    }
  });
}
