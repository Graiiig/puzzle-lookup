import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../src/config.js";
import { isValidEan, negativeTtlMsFor } from "../src/lookup.js";

test("negativeTtlMsFor uses the short error TTL when either source errored", () => {
  assert.equal(negativeTtlMsFor({ errored: true }, { errored: false }), config.errorTtlMs);
  assert.equal(negativeTtlMsFor({ errored: false }, { errored: true }), config.errorTtlMs);
  assert.equal(negativeTtlMsFor({ errored: true }, { errored: true }), config.errorTtlMs);
});

test("negativeTtlMsFor uses the long negative TTL only when both sources cleanly found nothing", () => {
  assert.equal(negativeTtlMsFor({ errored: false }, { errored: false }), config.negativeTtlMs);
});

test("negativeTtlMsFor's error TTL is meaningfully shorter than the negative TTL", () => {
  // Sanity check on the config values themselves, not just the branch logic —
  // this is the whole point of the split (bound retries without locking in
  // a false negative for as long as a genuine miss gets).
  assert.ok(config.errorTtlMs < config.negativeTtlMs);
});

test("isValidEan accepts 8-14 digit codes and rejects everything else", () => {
  assert.equal(isValidEan("12345678"), true);
  assert.equal(isValidEan("12345678901234"), true);
  assert.equal(isValidEan("1234567"), false);
  assert.equal(isValidEan("123456789012345"), false);
  assert.equal(isValidEan("abc12345"), false);
  assert.equal(isValidEan(""), false);
});
