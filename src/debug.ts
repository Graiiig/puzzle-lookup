import type { FastifyInstance } from "fastify";
import type { Page } from "playwright";
import { isAllowedSearchHost, parseAllowedSearchUrl } from "./allowedHosts.js";
import { requireApiKey } from "./auth.js";
import { newStealthContext } from "./browser.js";

type RenderResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

async function renderAllowedUrl<T>(
  raw: string | undefined,
  render: (page: Page) => Promise<T>,
): Promise<RenderResult<T>> {
  if (!raw) return { ok: false, status: 400, error: "missing 'url' query parameter" };

  let target: URL;
  try {
    target = parseAllowedSearchUrl(raw);
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
    if (!isAllowedSearchHost(finalHost)) {
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
