import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractBrandFromDescription,
  extractPieceCount,
  stripPuzzleFrSiteSuffix,
  upgradeToHttps,
} from "../src/util.js";

test("extractPieceCount finds counts in various formats", () => {
  assert.equal(extractPieceCount("Tour Eiffel de nuit - puzzle 1000 pieces"), 1000);
  assert.equal(extractPieceCount("ravensburger-tour-eiffel-puzzle-1000-pieces.p58864.html"), 1000);
  assert.equal(extractPieceCount("Puzzle 500 pcs"), 500);
  assert.equal(extractPieceCount("Puzzle 24 pièces enfant"), 24);
});

test("extractPieceCount returns undefined when absent", () => {
  assert.equal(extractPieceCount("Tour Eiffel de nuit"), undefined);
});

test("extractBrandFromDescription reads puzzle.fr's meta description template", () => {
  assert.equal(
    extractBrandFromDescription(
      "Puzzle Le Grand Livre de Disney de marque Trefl comprenant 6000 pièces à partir de 58.95 €.",
    ),
    "Trefl",
  );
});

test("extractBrandFromDescription returns undefined when the template doesn't match", () => {
  assert.equal(extractBrandFromDescription("Un puzzle sympa pour toute la famille."), undefined);
});

test("stripPuzzleFrSiteSuffix removes the trailing site name", () => {
  assert.equal(
    stripPuzzleFrSiteSuffix("Tour Eiffel de nuit - Puzzle.fr/Planet'Puzzles"),
    "Tour Eiffel de nuit",
  );
});

test("upgradeToHttps rewrites plain http image URLs", () => {
  assert.equal(
    upgradeToHttps("http://data.puzzle.fr/m82/p102850/p1.jpg"),
    "https://data.puzzle.fr/m82/p102850/p1.jpg",
  );
  assert.equal(
    upgradeToHttps("https://data.puzzle.fr/m82/p102850/p1.jpg"),
    "https://data.puzzle.fr/m82/p102850/p1.jpg",
  );
});
