import type { PrintPartyBlock } from '@tiles-erp/shared-types';

/** A company or branch row, as far as a printed letterhead is concerned. */
export interface LetterheadRow {
  name: string;
  legalName?: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
}

/**
 * Flattens a company or branch into the block printed at the head of a document. Every
 * printed document uses this, so a change to the address layout lands everywhere.
 */
export const toPartyBlock = (party: LetterheadRow): PrintPartyBlock => ({
  name: party.name,
  legalName: party.legalName ?? null,
  addressLines: [
    party.addressLine1,
    party.addressLine2,
    [party.city, party.state, party.pincode].filter(Boolean).join(' '),
  ]
    .map((line) => line?.trim() ?? '')
    .filter(Boolean),
  phone: party.phone,
  email: party.email,
  gstin: party.gstin,
});

/** Settings hold multi-line text as one string; a typed "\n" separates lines too. */
export const toLines = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(/\\n|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
