import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashBook,
  CashCountItem,
  CloseDayInput,
  DayCloseStatus,
  CashEntryInput,
  CashEntryItem,
  CashPosition,
  CashTransferInput,
  ExpenseHeadItem,
  ExpenseHeadLedger,
  LedgerAccountItem,
  LedgerAccountType,
  OwnerStatement,
  OwnerSummary,
  SaveExpenseHeadInput,
  SaveLedgerAccountInput,
  VarianceReport,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'ledger-accounts';
const HEADS = 'expense-heads';
const BOOK = 'cash-book';

export interface AccountFilters {
  branchId?: string;
  type?: LedgerAccountType;
  includeInactive?: boolean;
}

/** Cash boxes and bank accounts, each with what it holds right now. */
export function useLedgerAccounts(filters: AccountFilters = {}) {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.type) params.set('type', filters.type);
  if (filters.includeInactive) params.set('includeInactive', 'true');
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => apiFetch<LedgerAccountItem[]>(`/ledger-accounts?${params.toString()}`),
  });
}

export function useSaveLedgerAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: SaveLedgerAccountInput & { id?: string }) =>
      apiFetch<LedgerAccountItem>(id ? `/ledger-accounts/${id}` : '/ledger-accounts', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteLedgerAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/ledger-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useExpenseHeads(includeInactive = false, branchId?: string) {
  const params = new URLSearchParams();
  if (includeInactive) params.set('includeInactive', 'true');
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [HEADS, includeInactive, branchId],
    queryFn: () => apiFetch<ExpenseHeadItem[]>(`/ledger-accounts/expense-heads?${params}`),
  });
}

export function useExpenseHeadLedger(id: string | null, from: string, to: string, branchId?: string) {
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [HEADS, 'ledger', id, from, to, branchId],
    queryFn: () => apiFetch<ExpenseHeadLedger>(`/ledger-accounts/expense-heads/${id}/ledger?${params}`),
    enabled: Boolean(id && from && to && branchId),
  });
}

export function useSaveExpenseHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: SaveExpenseHeadInput & { id?: string }) =>
      apiFetch<ExpenseHeadItem>(
        id ? `/ledger-accounts/expense-heads/${id}` : '/ledger-accounts/expense-heads',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [HEADS] }),
  });
}

export function useDeleteExpenseHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/ledger-accounts/expense-heads/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [HEADS] }),
  });
}

/**
 * Posting anything invalidates the accounts list as well as the book.
 *
 * The balance shown beside each account is counted from these same rows, so leaving it
 * cached would show a drawer holding money it has just paid out.
 */
const invalidateBook = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [BOOK] });
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: [HEADS] });
  void queryClient.invalidateQueries({ queryKey: ['receipts'] });
};

export interface CashBookFilters {
  accountId: string;
  from: string;
  to: string;
  /** Show reversed entries and their contra rows. Hidden by default. */
  includeReversed?: boolean;
}

export function useCashBook(filters: CashBookFilters, enabled = true) {
  const params = new URLSearchParams({
    accountId: filters.accountId,
    from: filters.from,
    to: filters.to,
  });
  if (filters.includeReversed) params.set('includeReversed', 'true');
  return useQuery({
    queryKey: [BOOK, filters],
    queryFn: () => apiFetch<CashBook>(`/cash-book?${params.toString()}`),
    enabled: enabled && Boolean(filters.accountId),
  });
}

/** Every account on one day: where the money actually is. */
export function useCashPosition(on: string, branchId?: string, enabled = true) {
  const params = new URLSearchParams({ on });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [BOOK, 'position', on, branchId],
    queryFn: () => apiFetch<CashPosition>(`/cash-book/position?${params.toString()}`),
    enabled,
  });
}

export function usePostCashEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CashEntryInput) =>
      apiFetch<CashEntryItem>('/cash-book/entries', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateBook(queryClient),
  });
}

export function useCashTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CashTransferInput) =>
      apiFetch<CashEntryItem[]>('/cash-book/transfers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateBook(queryClient),
  });
}

export function useReverseCashEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<CashEntryItem>(`/cash-book/entries/${id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidateBook(queryClient),
  });
}

const COUNTS = 'cash-counts';

/** The next day open for counting, and what the book expects to find. */
export function useDayCloseStatus(accountId: string) {
  return useQuery({
    queryKey: [COUNTS, 'status', accountId],
    queryFn: () => apiFetch<DayCloseStatus>(`/cash-counts/status/${accountId}`),
    enabled: Boolean(accountId),
  });
}

/** Statuses used by the multi-account day-close review. */
export function useDayCloseStatuses(accountIds: string[]) {
  return useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: [COUNTS, 'status', accountId],
      queryFn: () => apiFetch<DayCloseStatus>(`/cash-counts/status/${accountId}`),
      staleTime: 0,
    })),
  });
}

export function useCashCounts(accountId?: string, branchId?: string) {
  const params = new URLSearchParams();
  if (accountId) params.set('accountId', accountId);
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [COUNTS, accountId, branchId],
    queryFn: () => apiFetch<CashCountItem[]>(`/cash-counts?${params.toString()}`),
  });
}

/**
 * Closing changes the book, the balances and the lock, so everything cash is refetched.
 *
 * A stale expected balance on this screen is worse than a slow one: it would have someone
 * counting against a figure that has already moved.
 */
const invalidateCounts = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [COUNTS] });
  void queryClient.invalidateQueries({ queryKey: [BOOK] });
  void queryClient.invalidateQueries({ queryKey: [KEY] });
};

export function useCloseDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseDayInput) =>
      apiFetch<CashCountItem>('/cash-counts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateCounts(queryClient),
  });
}

export function useReopenDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<CashCountItem>(`/cash-counts/${id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidateCounts(queryClient),
  });
}

const OWNERS = 'cash-owners';

/** Every owner: what they took over the period and what they still hold. */
export function useOwnerSummary(from: string, to: string, branchId?: string) {
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [OWNERS, from, to, branchId],
    queryFn: () => apiFetch<OwnerSummary>(`/cash-book/owners?${params}`),
    enabled: Boolean(branchId),
  });
}

/** One owner's statement, with the drawers the cash came from. */
export function useOwnerStatement(
  accountId: string,
  from: string,
  to: string,
  includeReversed = false,
  branchId?: string,
) {
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set('branchId', branchId);
  if (includeReversed) params.set('includeReversed', 'true');
  return useQuery({
    queryKey: [OWNERS, accountId, from, to, includeReversed, branchId],
    queryFn: () =>
      apiFetch<OwnerStatement>(`/cash-book/owners/${accountId}?${params.toString()}`),
    enabled: Boolean(accountId && branchId),
  });
}

/** How the day closes have gone: one line per account over a period. */
export function useVarianceReport(from: string, to: string, branchId?: string) {
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [COUNTS, 'variances', from, to, branchId],
    queryFn: () => apiFetch<VarianceReport>(`/cash-counts/variances?${params.toString()}`),
  });
}
