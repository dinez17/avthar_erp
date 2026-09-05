import { PAGINATION } from '@tiles-erp/config';
import type { Paginated } from '@tiles-erp/shared-types';
import { apiFetch } from './api-client';

/**
 * Reads every page of a paginated endpoint, for lists that populate a picker.
 *
 * A `<Select>` built from a truncated list does not fail — it renders empty for any record
 * whose value fell outside the page that was fetched, which reads as "this record has no
 * category" rather than "this list is short". The SixOrbit import made that concrete: 371
 * categories against a single 200-row request, while 115 brands fitted and looked fine.
 *
 * The cap exists so a mistake cannot spin forever, and it warns rather than truncating in
 * silence — because silence is the bug this helper exists to prevent. A list that reaches
 * it has outgrown a dropdown and wants server-side search instead.
 */
const MAX_PAGES = 25;

export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?';
  const items: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await apiFetch<Paginated<T>>(
      `${path}${separator}page=${page}&pageSize=${PAGINATION.MAX_PAGE_SIZE}`,
    );
    items.push(...result.items);
    if (!result.meta.hasNextPage) return items;
  }

  console.warn(
    `${path}: more than ${MAX_PAGES * PAGINATION.MAX_PAGE_SIZE} rows; the list is truncated and needs server-side search.`,
  );
  return items;
}
