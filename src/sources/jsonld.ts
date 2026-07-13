import type { Page } from "playwright";

interface ProductJsonLd {
  "@type"?: string | string[];
  name?: string;
  image?: string | string[] | { url?: string };
  brand?: string | { name?: string };
  gtin13?: string;
  gtin?: string;
  sku?: string;
}

function isProduct(node: unknown): node is ProductJsonLd {
  if (!node || typeof node !== "object") return false;
  const type = (node as ProductJsonLd)["@type"];
  if (!type) return false;
  return Array.isArray(type) ? type.includes("Product") : type === "Product";
}

/** Flattens @graph / array wrappers that some JSON-LD emitters use. */
function flatten(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === "object" && "@graph" in (node as Record<string, unknown>)) {
    return flatten((node as Record<string, unknown>)["@graph"]);
  }
  return [node];
}

/**
 * Reads schema.org Product structured data embedded in the page, if any.
 * Most e-commerce platforms (PrestaShop included) emit this for SEO rich
 * snippets, which makes it a far more stable extraction point than CSS
 * selectors that can change with the theme.
 */
export async function readProductJsonLd(page: Page): Promise<ProductJsonLd | undefined> {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  for (const raw of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const node of flatten(parsed)) {
      if (isProduct(node)) return node as ProductJsonLd;
    }
  }
  return undefined;
}

export function jsonLdImageUrl(product: ProductJsonLd): string | undefined {
  const { image } = product;
  if (!image) return undefined;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return image[0];
  return image.url;
}

export function jsonLdBrandName(product: ProductJsonLd): string | undefined {
  const { brand } = product;
  if (!brand) return undefined;
  return typeof brand === "string" ? brand : brand.name;
}

export type { ProductJsonLd };
