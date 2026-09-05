import type {
  ExpenseHeadItem,
  LedgerAccountItem,
  LedgerAccountType,
  SaveExpenseHeadInput,
  SaveLedgerAccountInput,
  UUID,
} from '@tiles-erp/shared-types';

export const LEDGER_ACCOUNT_REPOSITORY = Symbol('LEDGER_ACCOUNT_REPOSITORY');

export interface LedgerAccountFilter {
  branchId?: UUID;
  type?: LedgerAccountType;
  /** Inactive accounts are hidden by default: a closed bank account is noise. */
  includeInactive?: boolean;
}

/**
 * Port for cash boxes and bank accounts.
 *
 * A branch may hold as many as it likes — a drawer and an account per bank — and each
 * carries its own opening balance and its own book.
 */
export interface LedgerAccountRepository {
  list(filter: LedgerAccountFilter): Promise<LedgerAccountItem[]>;
  findById(id: UUID): Promise<LedgerAccountItem | null>;
  create(data: SaveLedgerAccountInput, createdBy: UUID): Promise<LedgerAccountItem>;
  update(id: UUID, data: SaveLedgerAccountInput, updatedBy: UUID): Promise<LedgerAccountItem>;
  /** Refused once the account has entries: its history would lose its home. */
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
  nextCode(type: LedgerAccountType, branchId: UUID | null): Promise<string>;

  listExpenseHeads(includeInactive: boolean): Promise<ExpenseHeadItem[]>;
  createExpenseHead(data: SaveExpenseHeadInput, createdBy: UUID): Promise<ExpenseHeadItem>;
  updateExpenseHead(
    id: UUID,
    data: SaveExpenseHeadInput,
    updatedBy: UUID,
  ): Promise<ExpenseHeadItem>;
  softDeleteExpenseHead(id: UUID, deletedBy: UUID): Promise<void>;
}
