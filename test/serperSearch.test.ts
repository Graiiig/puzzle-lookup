import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { config } from "../src/config.js";
import { findProductUrlViaSerper } from "../src/sources/serperSearch.js";

const originalFetch = globalThis.fetch;
const originalApiKey = config.serperApiKey;

const PUZZLE_FR_HOSTS = new Set(["www.puzzle.fr", "puzzle.fr"]);

beforeEach(() => {
  config.serperApiKey = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.serperApiKey = originalApiKey;
});

test("findProductUrlViaSerper returns a result on an allowed host, regardless of URL shape", async () => {
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

  const result = await findProductUrlViaSerper("3663384337789", ["puzzle.fr"], PUZZLE_FR_HOSTS);
  assert.deepEqual(result.urls, ["https://www.puzzle.fr/product/show/grafika-puzzle-rond-halloween-500-pieces"]);
  assert.equal(result.errored, false);
});

test("findProductUrlViaSerper returns every matching result, in order, not just the first", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        organic: [
          { link: "https://www.cultura.com/p-some-puzzle-3700217325114.html" },
          { link: "https://some-other-site.example/3700217325114" },
          { link: "https://www.joueclub.fr/puzzle/some-puzzle-3700217325114.html" },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const result = await findProductUrlViaSerper(
    "3700217325114",
    ["cultura.com", "joueclub.fr"],
    new Set(["www.cultura.com", "www.joueclub.fr"]),
  );
  assert.deepEqual(result.urls, [
    "https://www.cultura.com/p-some-puzzle-3700217325114.html",
    "https://www.joueclub.fr/puzzle/some-puzzle-3700217325114.html",
  ]);
});

test("findProductUrlViaSerper returns an empty list when nothing matches an allowed host", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        organic: [{ link: "https://some-other-site.example/3663384337789" }],
      }),
      { status: 200 },
    )) as typeof fetch;

  const result = await findProductUrlViaSerper("3663384337789", ["puzzle.fr"], PUZZLE_FR_HOSTS);
  assert.deepEqual(result.urls, []);
  assert.equal(result.errored, false);
});

test("findProductUrlViaSerper returns a clean miss (not errored) when Serper itself has no results", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ organic: [] }), { status: 200 })) as typeof fetch;

  const result = await findProductUrlViaSerper("0000000000000", ["puzzle.fr"], PUZZLE_FR_HOSTS);
  assert.deepEqual(result.urls, []);
  assert.equal(result.errored, false);
});

test("findProductUrlViaSerper reports errored on a non-ok HTTP response", async () => {
  globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch;

  const result = await findProductUrlViaSerper("4005556197766", ["puzzle.fr"], PUZZLE_FR_HOSTS);
  assert.deepEqual(result.urls, []);
  assert.equal(result.errored, true);
});

test("findProductUrlViaSerper reports errored when the API key isn't configured", async () => {
  config.serperApiKey = "";

  const result = await findProductUrlViaSerper("4005556197766", ["puzzle.fr"], PUZZLE_FR_HOSTS);
  assert.deepEqual(result.urls, []);
  assert.equal(result.errored, true);
});

test("findProductUrlViaSerper restricts the query to a single given site", async () => {
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    assert.equal(body.q, "site:philibertnet.com 3663384337789");
    return new Response(JSON.stringify({ organic: [] }), { status: 200 });
  }) as typeof fetch;

  await findProductUrlViaSerper("3663384337789", ["philibertnet.com"], new Set(["www.philibertnet.com"]));
});

test("findProductUrlViaSerper ORs multiple sites into one query", async () => {
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    assert.equal(body.q, "(site:cultura.com OR site:joueclub.fr) 3700217325114");
    return new Response(
      JSON.stringify({ organic: [{ link: "https://www.joueclub.fr/puzzle/some-puzzle-3700217325114.html" }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await findProductUrlViaSerper(
    "3700217325114",
    ["cultura.com", "joueclub.fr"],
    new Set(["www.cultura.com", "www.joueclub.fr"]),
  );
  assert.deepEqual(result.urls, ["https://www.joueclub.fr/puzzle/some-puzzle-3700217325114.html"]);
});
