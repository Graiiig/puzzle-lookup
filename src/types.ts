export type LookupSource = "puzzle.fr" | "ean-search.org";

export interface LookupFound {
  found: true;
  source: LookupSource;
  brand?: string;
  name: string;
  pieces?: number;
  imageUrl?: string;
  vendorUrl?: string;
}

export interface LookupNotFound {
  found: false;
}

export type LookupResult = LookupFound | LookupNotFound;
