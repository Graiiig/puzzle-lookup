import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { config } from "../src/config.js";
import { findPuzzleFrProductUrl } from "../src/sources/serperSearch.js";

const originalFetch = globalThis.fetch;
const originalApiKey = config.serperApiKey;

beforeEach(() => {
  config.serperApiKey = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.serperApiKey = originalApiKey;
});

test("findPuzzleFrProductUrl picks the first result on a puzzle.fr host, regardless of URL shape", async () => {
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    assert.equal(body.q, "site:puzzle.fr 3663384337789");
    return new Response(
      JSON.stringify({
        // puzzle.fr has been seen using more than one URL shape for product
        // pages (classic "slug.p<id>.html" and "/product/show/<slug>") — the
        // result shouldn't be filtered on shape, just on host.
        organic: [{ link: "https://www.puzzle.fr/product/show/grafika-puzzle-rond-halloween-500-pieces" }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await findPuzzleFrProductUrl("3663384337789");
  assert.equal(result.url, "https://www.puzzle.fr/product/show/grafika-puzzle-rond-halloween-500-pieces");
  assert.equal(result.errored, false);
});

test("findPuzzleFrProductUrl skips a result on a host other than puzzle.fr", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        organic: [{ link: "https://some-other-site.example/3663384337789" }],
      }),
      { status: 200 },
    )) as typeof fetch;

  const result = await findPuzzleFrProductUrl("3663384337789");
  assert.equal(result.url, undefined);
  assert.equal(result.errored, false);
});

test("findPuzzleFrProductUrl returns a clean miss (not errored) when nothing matches", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ organic: [] }), { status: 200 })) as typeof fetch;

  const result = await findPuzzleFrProductUrl("0000000000000");
  assert.equal(result.url, undefined);
  assert.equal(result.errored, false);
});

test("findPuzzleFrProductUrl reports errored on a non-ok HTTP response", async () => {
  globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch;

  const result = await findPuzzleFrProductUrl("4005556197766");
  assert.equal(result.url, undefined);
  assert.equal(result.errored, true);
});

test("findPuzzleFrProductUrl reports errored when the API key isn't configured", async () => {
  config.serperApiKey = "";

  const result = await findPuzzleFrProductUrl("4005556197766");
  assert.equal(result.url, undefined);
  assert.equal(result.errored, true);
});
