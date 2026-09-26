import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { config } from "../src/config.js";
import { fetchViaZyteApi } from "../src/zyteApi.js";

const originalFetch = globalThis.fetch;
const originalApiKey = config.zyteApiKey;

beforeEach(() => {
  config.zyteApiKey = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.zyteApiKey = originalApiKey;
});

function base64(html: string): string {
  return Buffer.from(html, "utf8").toString("base64");
}

test("fetchViaZyteApi decodes the base64 httpResponseBody on a successful target response", async () => {
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, "https://api.zyte.com/v1/extract");
    const headers = (init as RequestInit).headers as Record<string, string>;
    assert.equal(headers.Authorization, `Basic ${Buffer.from("test-key:").toString("base64")}`);
    const body = JSON.parse((init as RequestInit).body as string);
    assert.deepEqual(body, { url: "https://www.puzzle.fr/some-puzzle.html", httpResponseBody: true });
    return new Response(
      JSON.stringify({ statusCode: 200, httpResponseBody: base64("<html><title>Some Puzzle</title></html>") }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await fetchViaZyteApi("https://www.puzzle.fr/some-puzzle.html");
  assert.equal(result.html, "<html><title>Some Puzzle</title></html>");
  assert.equal(result.errored, false);
});

test("fetchViaZyteApi reports errored when the target site itself returned a non-2xx", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ statusCode: 403, httpResponseBody: base64("Access Denied") }), {
      status: 200,
    })) as typeof fetch;

  const result = await fetchViaZyteApi("https://www.puzzle.fr/some-puzzle.html");
  assert.equal(result.html, undefined);
  assert.equal(result.errored, true);
});

test("fetchViaZyteApi reports errored on a non-ok HTTP response from Zyte itself", async () => {
  globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch;

  const result = await fetchViaZyteApi("https://www.puzzle.fr/some-puzzle.html");
  assert.equal(result.html, undefined);
  assert.equal(result.errored, true);
});

test("fetchViaZyteApi reports errored when the API key isn't configured", async () => {
  config.zyteApiKey = "";

  const result = await fetchViaZyteApi("https://www.puzzle.fr/some-puzzle.html");
  assert.equal(result.html, undefined);
  assert.equal(result.errored, true);
});
