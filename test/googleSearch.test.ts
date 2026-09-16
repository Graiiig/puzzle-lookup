import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { config } from "../src/config.js";
import { findPuzzleFrProductUrl } from "../src/sources/googleSearch.js";

const originalFetch = globalThis.fetch;
const originalApiKey = config.googleCseApiKey;
const originalCx = config.googleCseCx;

beforeEach(() => {
  config.googleCseApiKey = "test-key";
  config.googleCseCx = "test-cx";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.googleCseApiKey = originalApiKey;
  config.googleCseCx = originalCx;
});

test("findPuzzleFrProductUrl picks the first result matching puzzle.fr's product URL convention", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        items: [
          { link: "https://www.puzzle.fr/marques/ravensburger.html" },
          { link: "https://www.puzzle.fr/ravensburger-tour-eiffel.p58864.html" },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const result = await findPuzzleFrProductUrl("4005556197766");
  assert.equal(result.url, "https://www.puzzle.fr/ravensburger-tour-eiffel.p58864.html");
  assert.equal(result.errored, false);
});

test("findPuzzleFrProductUrl returns a clean miss (not errored) when nothing matches", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch;

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

test("findPuzzleFrProductUrl reports errored when the API key/cx aren't configured", async () => {
  config.googleCseApiKey = "";
  config.googleCseCx = "";

  const result = await findPuzzleFrProductUrl("4005556197766");
  assert.equal(result.url, undefined);
  assert.equal(result.errored, true);
});
