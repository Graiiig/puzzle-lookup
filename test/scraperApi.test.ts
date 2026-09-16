import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { config } from "../src/config.js";
import { fetchViaScraperApi } from "../src/scraperApi.js";

const originalFetch = globalThis.fetch;
const originalApiKey = config.scraperApiKey;

beforeEach(() => {
  config.scraperApiKey = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.scraperApiKey = originalApiKey;
});

test("fetchViaScraperApi returns the fetched HTML on success", async () => {
  globalThis.fetch = (async (input) => {
    const url = new URL(input as string);
    assert.equal(url.hostname, "api.scraperapi.com");
    assert.equal(url.searchParams.get("api_key"), "test-key");
    assert.equal(url.searchParams.get("url"), "https://www.puzzle.fr/product/show/some-puzzle");
    return new Response("<html><title>Some Puzzle</title></html>", { status: 200 });
  }) as typeof fetch;

  const result = await fetchViaScraperApi("https://www.puzzle.fr/product/show/some-puzzle");
  assert.equal(result.html, "<html><title>Some Puzzle</title></html>");
  assert.equal(result.errored, false);
});

test("fetchViaScraperApi reports errored on a non-ok HTTP response", async () => {
  globalThis.fetch = (async () => new Response("error", { status: 500 })) as typeof fetch;

  const result = await fetchViaScraperApi("https://www.puzzle.fr/product/show/some-puzzle");
  assert.equal(result.html, undefined);
  assert.equal(result.errored, true);
});

test("fetchViaScraperApi reports errored when the API key isn't configured", async () => {
  config.scraperApiKey = "";

  const result = await fetchViaScraperApi("https://www.puzzle.fr/product/show/some-puzzle");
  assert.equal(result.html, undefined);
  assert.equal(result.errored, true);
});
