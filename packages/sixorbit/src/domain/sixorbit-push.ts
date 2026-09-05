import type { SixOrbitVariationAttribute } from './sixorbit-variation';

/**
 * Building the payload that creates or edits a variation in SixOrbit.
 *
 * This is the inverse of `sixorbit-variation.ts`, and it is deliberately not symmetrical
 * with it. Their read payload has ninety-odd fields; their write payload has forty, named
 * differently — `hsn` not `hsn_code`, `item_tax` not `tax`, `package_qty` not
 * `package_quantity`, `measurements` not `measured_qty`. Nothing about the read shape can
 * be reused, so the mapping is written out rather than derived.
 *
 * **An edit carries forward only write-shape fields.** We model a dozen of their fields and
 * would rather not blank the rest — their vendor mapping, their price bands, their rack
 * code — so an edit does start from the stored raw variation. But it takes from it *only*
 * the keys their write form actually accepts, listed in `CARRIED_FORWARD` below.
 *
 * That restriction is the whole point. An earlier version spread the raw payload wholesale
 * (`{ ...raw, ...ours }`) on the theory that anything we did not overwrite was preserved.
 * It preserved nothing: because the two shapes are named differently, a read field like
 * `hsn_code` is not the write field `hsn`, so it was never going to be read back. All the
 * spread did was post ninety unrecognised keys — `variation_name`, `category_id`,
 * `price_with_tax`, `limit` — into a form that expects thirty-five, and their validator
 * answered with `Please Provide valid item name`. The payload their own documented edit
 * request sends is flat, small, and write-shaped; this now sends the same thing.
 */

/** Their measurement ids, as observed in the Avthar tenant's own data. */
export const SIXORBIT_MEASUREMENT = {
  /** `meaid: "27"`, label PCS — the base unit a tile is counted in. */
  PIECES: '27',
  /** `measured_meaid: "10"`, label SQFT — the unit an area is quoted in. */
  SQFT: '10',
  /** `package_meaid: "40"`, label Box. */
  BOX: '40',
} as const;

/** What a product must supply before it can be written to SixOrbit. */
export interface SixOrbitPushInput {
  /** Their id. Absent for a product that has never been pushed. */
  sixorbitId: string | null;
  name: string;
  /** Our sku, which is their `variation_number` for anything we imported. */
  sku: string;
  hsnCode: string;
  gstRate: number;
  sellingRate: number | null;
  purchaseRate: number | null;
  mrp: number | null;
  piecesPerBox: number;
  sqftPerBox: number;
  barcode: string | null;
  isActive: boolean;
  /** Their brand id. Null means the brand exists only here. */
  brandSixorbitId: string | null;
  /** Their category id. Null means the category exists only here. */
  categorySixorbitId: string | null;
  /** Attribute pairs captured at import. Empty for a product invented here. */
  attributes: SixOrbitVariationAttribute[];
  /** Their own last payload for this product, when we have one. */
  raw: Record<string, unknown> | null;
}

/** Why a product cannot be written to SixOrbit at all. */
export type SixOrbitPushBlock =
  'BRAND_NOT_IN_SIXORBIT' | 'CATEGORY_NOT_IN_SIXORBIT' | 'NO_SELLING_PRICE' | 'NO_GEOMETRY';

export interface SixOrbitPushPlan {
  /** `create` when they have never seen it, `edit` when they have. */
  operation: 'create' | 'edit';
  payload: Record<string, unknown>;
  /** Non-empty means do not send. The first entry is the reason shown to a human. */
  blocks: SixOrbitPushBlock[];
}

/** Plain language for the worklist. Never show a human the enum. */
export const SIXORBIT_PUSH_BLOCK_REASONS: Record<SixOrbitPushBlock, string> = {
  BRAND_NOT_IN_SIXORBIT:
    'Its brand does not exist in SixOrbit, and their API has no way to create one. Add the brand in SixOrbit, re-run the product import, then push again.',
  CATEGORY_NOT_IN_SIXORBIT:
    'Its category does not exist in SixOrbit, and their API has no way to create one. Add the category in SixOrbit, re-run the product import, then push again.',
  NO_SELLING_PRICE: 'It has no selling rate, which SixOrbit requires on a variation.',
  NO_GEOMETRY:
    'It has no pieces per box or no area per box, so the quantity SixOrbit would record is meaningless.',
};

/** Their numbers are strings. A null becomes "0", which is what their own rows carry. */
const money = (value: number | null): string => (value === null ? '0' : String(value));

/**
 * Area of one piece, which is what their `measurements` field holds.
 *
 * We store area per *box*; they store it per *piece* and multiply by `package_qty`.
 * Sending our box figure into their per-piece field would inflate every quantity by the
 * number of pieces in a box — the single most damaging mistake available here.
 */
export const sqftPerPiece = (sqftPerBox: number, piecesPerBox: number): number =>
  piecesPerBox > 0 ? Number((sqftPerBox / piecesPerBox).toFixed(4)) : 0;

/**
 * Write-form fields that belong to SixOrbit rather than to us, kept across an edit.
 *
 * Taken from the `variation/edit_variation_submit` request in their own Postman
 * collection. Anything not on this list and not in `ours` is not sent at all — a read
 * payload is not a write payload, and posting its fields at their form achieves nothing
 * except giving the validator something to object to.
 */
export const CARRIED_FORWARD = [
  'company',
  'default_vendor',
  'dealer_price',
  'min_discount',
  'max_discount',
  'weight',
  'incentive',
  'item_cess',
  'profitability',
  'shelf',
  'material',
  'pcount',
  'pcount_qty',
  'fixed_price',
  'rack_code',
  'images',
] as const;

/** Their fields, and only theirs, out of whatever we happen to have stored. */
const carryForward = (raw: Record<string, unknown> | null): Record<string, unknown> => {
  if (!raw) return {};
  const kept: Record<string, unknown> = {};
  for (const key of CARRIED_FORWARD) {
    const value = raw[key];
    if (value !== undefined && value !== null) kept[key] = value;
  }
  return kept;
};

export function buildSixOrbitPushPlan(input: SixOrbitPushInput): SixOrbitPushPlan {
  const blocks: SixOrbitPushBlock[] = [];

  // Masters first: their API can create neither a brand nor a category, so a product
  // under one they do not have is not a failure to retry — it is work for a human.
  if (!input.brandSixorbitId) blocks.push('BRAND_NOT_IN_SIXORBIT');
  if (!input.categorySixorbitId) blocks.push('CATEGORY_NOT_IN_SIXORBIT');
  if (input.sellingRate === null) blocks.push('NO_SELLING_PRICE');
  if (input.piecesPerBox <= 0 || input.sqftPerBox <= 0) blocks.push('NO_GEOMETRY');

  // The fields we own, and only those. Anything absent here is either theirs to keep
  // (on an edit) or left at their default (on a create).
  const ours: Record<string, unknown> = {
    item_name: input.name,
    sku_code: input.sku,
    hsn: input.hsnCode,
    item_tax: String(input.gstRate),
    price: money(input.sellingRate),
    purchase_price: money(input.purchaseRate),
    mrp: money(input.mrp),
    package_qty: String(input.piecesPerBox),
    measurements: String(sqftPerPiece(input.sqftPerBox, input.piecesPerBox)),
    unit: SIXORBIT_MEASUREMENT.PIECES,
    measurement_unit: SIXORBIT_MEASUREMENT.SQFT,
    pcount_meaid: SIXORBIT_MEASUREMENT.PIECES,
    pc_meaid: SIXORBIT_MEASUREMENT.SQFT,
    barcode: input.barcode ?? '',
    brand: input.brandSixorbitId ?? '',
    categories: [{ id: input.categorySixorbitId ?? '' }],
    attributes: input.attributes.map((a) => ({ aid: a.aid, avid: a.avid })),
  };

  // Defaults for the flags their form sends. Chosen to match what an ordinary stocked tile
  // looks like in their own data rather than invented. An edit lays whatever they gave us
  // over these, so a default only applies where they have told us nothing.
  const defaults: Record<string, unknown> = {
    item_type: 'Closed Stock',
    product_type: 'Product',
    item_service: '0',
    fixed_price: ['0'],
    pcount: ['1'],
    images: [],
    company: '',
    default_vendor: '',
    rack_code: '',
  };

  // Ours last in both cases: the flags above are theirs to keep, the fields below are ours
  // to own, and `stock_available` follows our active toggle either way.
  const stock = { stock_available: [input.isActive ? '1' : '0'] };

  if (input.sixorbitId) {
    return {
      operation: 'edit',
      payload: {
        ...defaults,
        ...carryForward(input.raw),
        ...ours,
        ...stock,
        isvid: input.sixorbitId,
      },
      blocks,
    };
  }

  return { operation: 'create', payload: { ...defaults, ...ours, ...stock }, blocks };
}
