import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { extractProduct } from "../src/sources/puzzleFr.js";
import { extractGenericProduct } from "../src/sources/genericProductExtract.js";
import { stripPhilibertImageFormat } from "../src/util.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser.close();
});

async function loadFixture(name: string): Promise<void> {
  const html = await readFile(path.join(fixturesDir, name), "utf8");
  await page.setContent(html);
}

test("extractProduct reads brand/name/pieces/image from JSON-LD", async () => {
  await loadFixture("puzzlefr-product.html");
  const result = await extractProduct(
    page,
    "https://www.puzzle.fr/ravensburger-tour-eiffel-de-nuit-puzzle-1000-pieces.p58864.html",
  );
  assert.ok(result?.found);
  if (!result?.found) return;
  assert.equal(result.source, "puzzle.fr");
  assert.equal(result.brand, "Ravensburger");
  assert.equal(result.name, "Tour Eiffel de nuit - Puzzle 1000 pièces");
  assert.equal(result.pieces, 1000);
  assert.equal(result.imageUrl, "https://www.puzzle.fr/img/p/5/8/8/6/4/58864-large.jpg");
});

test("extractProduct falls back to <title>/description when no JSON-LD or og:meta", async () => {
  await loadFixture("puzzlefr-product-no-jsonld.html");
  const result = await extractProduct(
    page,
    "https://www.puzzle.fr/le-grand-livre-de-disney-puzzle-6000-pieces.p12345.html",
  );
  assert.ok(result?.found);
  if (!result?.found) return;
  assert.equal(result.brand, "Trefl");
  assert.equal(result.pieces, 6000);
  assert.equal(result.name, "Puzzle Le Grand Livre de Disney Trefl-81037 6000 pièces Puzzles - Disney");
});

test("extractGenericProduct reads brand/name/pieces/image from JSON-LD, applying Philibert's image-format transform", async () => {
  await loadFixture("philibert-product.html");
  const result = await extractGenericProduct(
    page,
    "https://www.philibertnet.com/fr/grafika/1234-puzzle-rond-halloween.html",
    { source: "philibertnet.com", transformImageUrl: stripPhilibertImageFormat },
  );
  assert.ok(result?.found);
  if (!result?.found) return;
  assert.equal(result.source, "philibertnet.com");
  assert.equal(result.brand, "Grafika");
  assert.equal(result.name, "Puzzle Rond - Halloween - Grafika - 500 pieces");
  assert.equal(result.pieces, 500);
  assert.equal(result.imageUrl, "https://cdn1.philibertnet.com/1234/puzzle-rond-halloween-grafika.jpg");
});
