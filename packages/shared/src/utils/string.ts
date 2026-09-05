export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const capitalize = (input: string): string =>
  input.length === 0 ? input : input.charAt(0).toUpperCase() + input.slice(1);

export const truncate = (input: string, max: number): string =>
  input.length <= max ? input : `${input.slice(0, Math.max(0, max - 1))}…`;

/** Generates a human-readable, prefixed document number, e.g. INV-2026-000123. */
export const buildDocumentNumber = (prefix: string, year: number, sequence: number): string =>
  `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
