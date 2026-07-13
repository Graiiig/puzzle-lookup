import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPieceCount } from "../src/util.js";

test("extractPieceCount finds counts in various formats", () => {
  assert.equal(extractPieceCount("Tour Eiffel de nuit - puzzle 1000 pieces"), 1000);
  assert.equal(extractPieceCount("ravensburger-tour-eiffel-puzzle-1000-pieces.p58864.html"), 1000);
  assert.equal(extractPieceCount("Puzzle 500 pcs"), 500);
  assert.equal(extractPieceCount("Puzzle 24 pièces enfant"), 24);
});

test("extractPieceCount returns undefined when absent", () => {
  assert.equal(extractPieceCount("Tour Eiffel de nuit"), undefined);
});
