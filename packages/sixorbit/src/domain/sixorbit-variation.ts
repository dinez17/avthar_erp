import type { SixOrbitMappingWarning } from '@tiles-erp/shared-types';

/**
 * Turning a SixOrbit variation into a TilesERP product.
 *
 * Pure, and deliberately so: this is where a catalogue of several thousand tiles either
 * arrives with the right geometry and the right money on it, or quietly does not. It is
 * far cheaper to prove that against a handful of real rows in a test than to discover it
 * after an import.
 *
 * Every value in their payload is a string, including the numbers, and several of the
 * numeric ones exceed the safe integer range. Nothing here parses an identifier.
 */

/** One row of `data.variations` from `task=variation/fetch`. */
export interface SixOrbitVariationAttribute {
  aid: string;
  attr_name: string;
  avid: string;
  attr_value: string;
}

export interface SixOrbitVariation {
  isvid: string;
  variation_number?: string;
  variation_name?: string;
  item_name?: string;
  sku?: string;
  status_id?: string;
  hsn_code?: string;
  tax?: string;
  price?: string;
  price_with_tax?: string;
  purchase_price?: string;
  mrp?: string;
  /** Pieces in a box. Their `c_package_measurement` names the package unit. */
  package_quantity?: string;
  c_package_measurement?: string;
  /** Area of ONE PIECE, in `measured_unit`. */
  measured_qty?: string;
  measured_unit?: string;
  unit?: string;
  weight?: string;
  barcode?: string;
  brand?: string;
  brand_id?: string;
  category?: string;
  category_id?: string;
  main_category?: string;
  main_category_id?: string;
  updated_time?: string;
  created_time?: string;
  attributes?: SixOrbitVariationAttribute[];
  /** Total rows matching the query — the same figure on every row. */
  limit?: string;
}

export interface SixOrbitVariationPage {
  variations?: SixOrbitVariation[];
}

export type { SixOrbitMappingWarning };

export interface MappedSixOrbitMaster {
  sixorbitId: string;
  name: string;
}

export interface MappedSixOrbitProduct {
  sixorbitId: string;
  sku: string;
  name: string;
  hsnCode: string;
  gstRate: number;
  sellingRate: number | null;
  purchaseRate: number | null;
  landingCost: number | null;
  mrp: number | null;
  piecesPerBox: number;
  sqftPerBox: number;
  sizeMm: string | null;
  barcode: string | null;
  isActive: boolean;
  brand: MappedSixOrbitMaster | null;
  category: MappedSixOrbitMaster | null;
  attributes: SixOrbitVariationAttribute[];
  updatedAt: Date | null;
  warnings: SixOrbitMappingWarning[];
  /**
   * The variation exactly as they sent it.
   *
   * Their payload carries ninety-odd fields and this maps a dozen. Keeping the original
   * means a later sprint that needs one of the other seventy-eight does not have to
   * re-import the catalogue to get at it.
   */
  raw: SixOrbitVariation;
}

/** Square feet in a square metre. */
const SQFT_PER_SQM = 10.7639104;

/**
 * How far the stated area may drift from the tile's own size before it is worth flagging.
 *
 * Two per cent absorbs honest rounding — a supplier quoting 800mm as 2.7ft rather than
 * 2.625ft is out by 2.9%, which is exactly the sort of thing this is meant to surface.
 */
const AREA_TOLERANCE = 0.02;

/** Below this fraction of the selling price, a cost reads as unmaintained data. */
const IMPLAUSIBLE_COST_RATIO = 0.05;

/** Their numbers arrive as strings like "18.00000000"; empty and "0" are different things. */
const num = (value: string | undefined | null): number | null => {
  if (value === undefined || value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * A foreign key from their side, or null when they mean "none".
 *
 * SixOrbit writes `"0"` where a relation is absent — `parent_category_id`,
 * `franchiser_isvid`, `e_commerce_id` and `appltid` all carry it in real rows. `"0"` is a
 * truthy string in JavaScript, so treating it as an id would have the importer cheerfully
 * create a brand called "0" and hang every unbranded product off it, which is exactly the
 * quietly-accumulating junk master the import is written to avoid.
 */
const externalId = (value: string | undefined | null): string | null => {
  const trimmed = text(value);
  return trimmed === null || trimmed === '0' ? null : trimmed;
};

const text = (value: string | undefined | null): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  // Their exports write the four characters N-U-L-L into text columns rather than a null.
  return trimmed === '' || trimmed.toUpperCase() === 'NULL' ? null : trimmed;
};

/** Their timestamps are "YYYY-MM-DD HH:mm:ss" in the tenant's local time, not ISO. */
export const parseSixOrbitTimestamp = (value: string | undefined): Date | null => {
  const raw = text(value);
  if (!raw || raw.startsWith('0000-00-00')) return null;
  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** The SIZE attribute's value, exactly as they wrote it — "1600X800", "4X2". */
export const sizeFromAttributes = (
  attributes: SixOrbitVariationAttribute[] | undefined,
): string | null => {
  const size = attributes?.find((a) => a.attr_name?.trim().toUpperCase() === 'SIZE');
  return text(size?.attr_value);
};

/**
 * The area one tile of a stated size ought to be, in square feet.
 *
 * Their SIZE attribute mixes units without saying so — "1600X800" is millimetres and
 * "4X2" is feet. Nothing in the payload distinguishes them, so magnitude decides: a tile
 * is not a hundred feet across, and it is not two millimetres across either. Returns null
 * when the value is not a plain two-part size, in which case nothing is checked rather
 * than something being guessed.
 */
export const expectedSqftForSize = (size: string | null): number | null => {
  if (!size) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*$/.exec(size);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const millimetres = a >= 100 && b >= 100;
  return millimetres ? (a / 1000) * (b / 1000) * SQFT_PER_SQM : a * b;
};

/**
 * Maps one variation.
 *
 * Geometry is the part worth reading twice. `measured_qty` is the area of a single piece
 * and `package_quantity` is how many pieces are in a box, so a box covers the product of
 * the two. Their own data proves it: "AV ROVEN GREY E 4X2 (3)" is a four-foot by two-foot
 * tile, and `measured_qty` is exactly 8.
 */
export function mapSixOrbitVariation(variation: SixOrbitVariation): MappedSixOrbitProduct {
  const warnings: SixOrbitMappingWarning[] = [];

  const piecesPerBox = num(variation.package_quantity) ?? 0;
  const sqftPerPiece = num(variation.measured_qty) ?? 0;
  const sqftPerBox = sqftPerPiece * piecesPerBox;
  if (piecesPerBox <= 0 || sqftPerPiece <= 0) warnings.push('MISSING_GEOMETRY');

  const size = sizeFromAttributes(variation.attributes);
  const brandId = externalId(variation.brand_id);
  const categoryId = externalId(variation.category_id);
  const expected = expectedSqftForSize(size);
  if (expected !== null && sqftPerPiece > 0) {
    if (Math.abs(sqftPerPiece - expected) / expected > AREA_TOLERANCE) {
      warnings.push('AREA_DISAGREES_WITH_SIZE');
    }
  }

  const sellingRate = num(variation.price);
  // Their `purchase_price` is the landed figure, confirmed by the business. It is NOT
  // `price_with_tax`, which is the selling price grossed up and would put GST into cost.
  const landingCost = num(variation.purchase_price);

  if (sellingRate === null || sellingRate <= 0) {
    warnings.push('MISSING_PRICE');
  } else if (landingCost !== null && landingCost > 0) {
    if (landingCost >= sellingRate) warnings.push('COST_NOT_BELOW_PRICE');
    else if (landingCost / sellingRate < IMPLAUSIBLE_COST_RATIO) {
      warnings.push('COST_IMPLAUSIBLY_LOW');
    }
  }

  const name = text(variation.variation_name) ?? text(variation.item_name) ?? '';

  return {
    sixorbitId: variation.isvid,
    // Their `sku` is empty on every row; `variation_number` is the code their own users
    // recognise, which matters on a picking list far more than an internal id would.
    sku: text(variation.sku) ?? text(variation.variation_number) ?? variation.isvid,
    name,
    hsnCode: text(variation.hsn_code) ?? '',
    gstRate: num(variation.tax) ?? 0,
    sellingRate,
    purchaseRate: landingCost,
    landingCost,
    mrp: num(variation.mrp),
    piecesPerBox,
    sqftPerBox,
    sizeMm: size,
    barcode: text(variation.barcode),
    isActive: variation.status_id === '1',
    brand: brandId ? { sixorbitId: brandId, name: text(variation.brand) ?? brandId } : null,
    category: categoryId
      ? { sixorbitId: categoryId, name: text(variation.category) ?? categoryId }
      : null,
    attributes: variation.attributes ?? [],
    updatedAt: parseSixOrbitTimestamp(variation.updated_time),
    warnings,
    raw: variation,
  };
}

/** The total row count, which they repeat on every row rather than in a header. */
export const totalFromVariationPage = (page: SixOrbitVariationPage): number | null =>
  num(page.variations?.[0]?.limit);
