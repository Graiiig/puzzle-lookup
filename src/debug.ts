import type { FastifyInstance } from "fastify";
import type { Page } from "playwright";
import { requireApiKey } from "./auth.js";
import { newStealthContext } from "./browser.js";

/**
 * Restricted to the two scraped domains: these routes render arbitrary
 * URLs, so without an allowlist they'd be an open SSRF proxy (even behind
 * the API key). Both the initial URL and the page's URL after navigation
 * (redirects included) are checked against this list.
 */
const ALLOWED_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr", "www.ean-search.org", "ean-search.org"]);

function parseAllowedUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(`scheme not allowed: ${url.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }
  return url;
}

type RenderResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

async function renderAllowedUrl<T>(
  raw: string | undefined,
  render: (page: Page) => Promise<T>,
): Promise<RenderResult<T>> {
  if (!raw) return { ok: false, status: 400, error: "missing 'url' query parameter" };

  let target: URL;
  try {
    target = parseAllowedUrl(raw);
  } catch (err) {
    return { ok: false, status: 400, error: (err as Error).message };
  }

  const context = await newStealthContext();
  try {
    const page = await context.newPage();
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    // Re-check after navigation: the allowlist above only covers the
    // requested URL, not wherever the target site's own redirects led.
    const finalHost = new URL(page.url()).hostname;
    if (!ALLOWED_HOSTS.has(finalHost)) {
      return { ok: false, status: 502, error: `redirected outside allowed hosts: ${finalHost}` };
    }

    return { ok: true, value: await render(page) };
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message };
  } finally {
    await context.close();
  }
}

/**
 * Manual tuning helper for environments (like this VPS) that have network
 * access to puzzle.fr/ean-search.org but no local Playwright setup. Same
 * purpose as scripts/inspect.ts, exposed over HTTP instead.
 */
export function registerDebugRoutes(app: FastifyInstance): void {
  app.get("/debug/html", { preHandler: requireApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string };
    const result = await renderAllowedUrl(url, (page) => page.content());
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return reply.type("text/html").send(result.value);
  });

  app.get("/debug/screenshot", { preHandler: requireApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string };
    const result = await renderAllowedUrl(url, (page) => page.screenshot({ fullPage: true }));
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return reply.type("image/png").send(result.value);
  });
}
