import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { extractProduct, pickProductUrl } from "../src/sources/puzzleFr.js";
import { findResultName, findVendorLink } from "../src/sources/eanSearch.js";

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

test("pickProductUrl finds the puzzle.fr product link via URL convention", async () => {
  await loadFixture("puzzlefr-search.html");
  const url = await pickProductUrl(page);
  assert.equal(
    url,
    "https://www.puzzle.fr/ravensburger-tour-eiffel-de-nuit-puzzle-1000-pieces.p58864.html",
  );
});

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

test("findResultName + findVendorLink read ean-search.org results", async () => {
  await loadFixture("eansearch-results.html");
  const name = await findResultName(page);
  const vendorUrl = await findVendorLink(page);
  assert.equal(name, "Ravensburger Tour Eiffel de nuit 1000 pieces");
  assert.equal(vendorUrl, "https://www.example-shop.com/product/58864");
});
