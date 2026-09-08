import type { ISODateString, UUID } from './common';

/** Application setting exposed to the admin UI. */
export interface SettingItem {
  key: string;
  value: string;
  description: string | null;
  updatedAt: ISODateString;
  version: number;
}

/**
 * The two settings every screen needs, including the ones nobody has signed in to yet.
 *
 * Listing settings requires SETTINGS_MANAGE, which a salesman does not have and a
 * login page cannot have at all — so the name and logo are served separately rather
 * than making the whole settings table public.
 */
export interface BrandingInfo {
  /** Display name for the sidebar, the browser tab and printed headers. */
  appName: string;
  /**
   * The logo as a data URI, or null when none has been uploaded.
   *
   * Held inline rather than as a file reference so it is covered by the database
   * backup — the uploads volume is not.
   */
  logo: string | null;
}

/** One persisted audit trail entry. */
export interface AuditLogItem {
  id: UUID;
  entity: string;
  entityId: string;
  action: string;
  userId: UUID | null;
  userEmail: string | null;
  changes: Record<string, unknown> | null;
  createdAt: ISODateString;
}

/** Payload captured by the API audit interceptor and persisted by the worker. */
export interface AuditJobData {
  entity: string;
  entityId: string;
  action: string;
  userId: string | null;
  changes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Document numbering
// ---------------------------------------------------------------------

export type DocumentType =
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'SALES_INVOICE'
  | 'RECEIPT'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_RETURN'
  | 'SUPPLIER_PAYMENT'
  | 'STOCK_TRANSFER'
  | 'TRANSFER_CHALLAN'
  | 'TRANSFER_INVOICE'
  | 'GATE_PASS'
  | 'DRIVER_CASH_HANDOVER'
  | 'TRANSPORTER'
  | 'DRIVER'
  | 'CASH_ENTRY'
  | 'EXPENSE'
  | 'CASH_COUNT'
  | 'CREDIT_APPROVAL';

/** How one branch numbers one kind of document. */
export interface NumberSeriesItem {
  id: UUID | null;
  documentType: DocumentType;
  /** Null for a company-wide series: a transporter belongs to no branch. */
  branchId: UUID | null;
  branchName: string | null;
  prefix: string;
  /**
   * The built-in code for this document — QT, INV, GRN.
   *
   * Kept even once a prefix has been set, so a branch prefix can be composed with it:
   * AMB + INV reads AMB-INV, which is what tells two documents apart on paper.
   */
  defaultPrefix: string;
  separator: string;
  padding: number;
  resetAnnually: boolean;
  /** True when no row exists yet and the built-in default is in force. */
  isDefault: boolean;
  /** The number the next document will actually get. */
  nextNumber: string;
  /** How many have been issued in the current financial year. */
  issuedThisYear: number;
  version: number;
}

export interface SaveNumberSeriesInput {
  documentType: DocumentType;
  branchId: UUID | null;
  prefix: string;
  separator?: string;
  padding?: number;
  resetAnnually?: boolean;
}

export interface SaveNumberSeriesBulkInput {
  branchId: UUID | null;
  /** Only the rows that actually changed need sending. */
  series: {
    documentType: DocumentType;
    prefix: string;
    separator?: string;
    padding?: number;
    resetAnnually?: boolean;
  }[];
}

// ---------------------------------------------------------------------
// Cash and bank
// ---------------------------------------------------------------------

export type LedgerAccountType =
  | 'CASH'
  | 'BANK'
  /** Cash held by an owner after the day's takings are handed over. */
  | 'OWNER';
export type CashEntryType = 'RECEIPT' | 'PAYMENT' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
export type CashEntryDirection = 'IN' | 'OUT';
export type CashEntrySource =
  | 'MANUAL'
  | 'CUSTOMER_RECEIPT'
  | 'SUPPLIER_PAYMENT'
  | 'DRIVER_CASH'
  /** The adjusting entry a day close writes to bring the book to what was counted. */
  | 'CASH_COUNT';

/** A cash box or a bank account, with what it holds right now. */
export interface LedgerAccountItem {
  id: UUID;
  code: string;
  name: string;
  type: LedgerAccountType;
  branchId: UUID | null;
  branchName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  openingBalance: number;
  openingDate: ISODateString;
  /** What a drawer keeps back at close to open with tomorrow. */
  retainedFloat: number;
  /** Opening plus every entry since — never stored, always counted. */
  currentBalance: number;
  isActive: boolean;
  notes: string | null;
  version: number;
}

export interface SaveLedgerAccountInput {
  code?: string;
  name: string;
  type: LedgerAccountType;
  branchId?: UUID | null;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  openingBalance?: number;
  openingDate?: ISODateString;
  retainedFloat?: number;
  isActive?: boolean;
  notes?: string;
  version?: number;
}

export interface ExpenseHeadItem {
  id: UUID;
  code: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  /** Spent under this head in the current financial year. */
  spentThisYear: number;
  version: number;
}

export interface SaveExpenseHeadInput {
  code?: string;
  name: string;
  isActive?: boolean;
  notes?: string;
  version?: number;
}

export interface CashEntryItem {
  id: UUID;
  entryNumber: string;
  accountId: UUID;
  accountName: string;
  branchId: UUID | null;
  branchName: string | null;
  entryDate: ISODateString;
  type: CashEntryType;
  direction: CashEntryDirection;
  amount: number;
  expenseHeadId: UUID | null;
  expenseHeadName: string | null;
  counterAccountId: UUID | null;
  counterAccountName: string | null;
  source: CashEntrySource;
  refType: string | null;
  refNumber: string | null;
  referenceNo: string | null;
  narration: string | null;
  reversedAt: ISODateString | null;
  reversalReason: string | null;
  /** The balance after this entry, when read as part of a book. */
  balance: number;
}

export interface CashEntryInput {
  accountId: UUID;
  entryDate?: ISODateString;
  type: Exclude<CashEntryType, 'TRANSFER'>;
  amount: number;
  expenseHeadId?: UUID | null;
  referenceNo?: string;
  narration?: string;
}

export interface CashTransferInput {
  fromAccountId: UUID;
  toAccountId: UUID;
  entryDate?: ISODateString;
  amount: number;
  referenceNo?: string;
  narration?: string;
}

/** One account's book over a period. */
export interface CashBook {
  accountId: UUID;
  accountName: string;
  accountType: LedgerAccountType;
  from: ISODateString;
  to: ISODateString;
  /** What the account held the moment before the period began. */
  openingBalance: number;
  received: number;
  paid: number;
  closingBalance: number;
  /**
   * Cancelled rows inside the period that are not being shown.
   *
   * A reversal and its contra net to nothing, so both are hidden by default — showing
   * them doubles every total in a way that reads as fact. This is how many there are, so
   * the page can offer them rather than pretending nothing happened.
   */
  reversedHidden: number;
  entries: CashEntryItem[];
}

/** Every account's position on one day — the "where is the money" answer. */
export interface CashPositionRow {
  accountId: UUID;
  accountName: string;
  accountType: LedgerAccountType;
  branchName: string | null;
  openingBalance: number;
  received: number;
  paid: number;
  closingBalance: number;
}

export interface CashPosition {
  on: ISODateString;
  rows: CashPositionRow[];
  /** In the tills. Money handed to an owner is not in a till and is not counted here. */
  totalCash: number;
  totalBank: number;
  /** Held by owners after the day's takings were handed over. */
  totalWithOwners: number;
  /** Everything the company holds, wherever it is sitting. */
  total: number;
}

/** How many of each note and coin were counted. Keys are the denomination values. */
export type DenominationCounts = Record<string, number>;

export interface CashCountItem {
  id: UUID;
  countNo: string;
  accountId: UUID;
  accountName: string;
  accountType: LedgerAccountType;
  branchId: UUID | null;
  branchName: string | null;
  /** The day that was closed. */
  closeDate: ISODateString;
  /** What the book said at the end of that day, frozen when it was closed. */
  expectedBalance: number;
  countedAmount: number;
  /** Counted less expected. Negative means the drawer was short. */
  variance: number;
  /** What went to an owner, and who took it. */
  handoverAmount: number;
  handoverAccountId: UUID | null;
  handoverAccountName: string | null;
  /** What the drawer kept — tomorrow's opening balance. */
  retainedAmount: number;
  denominations: DenominationCounts | null;
  /** Set when the difference was posted rather than merely noted. */
  adjustmentEntryId: UUID | null;
  notes: string | null;
  reopenedAt: ISODateString | null;
  reopenReason: string | null;
  closedByName: string | null;
  createdAt: ISODateString;
}

export interface CloseDayInput {
  accountId: UUID;
  closeDate: ISODateString;
  countedAmount: number;
  denominations?: DenominationCounts;
  /**
   * Whether to write an adjusting entry so the book matches what was counted.
   *
   * Off means the difference is recorded and the book left alone — which is right while
   * someone is still looking for the missing note.
   */
  postDifference?: boolean;
  /** The day's takings going to an owner. The drawer keeps the rest. */
  handoverAmount?: number;
  handoverAccountId?: UUID | null;
  notes?: string;
}

/** What the screen needs before anyone counts anything. */
export interface DayCloseStatus {
  accountId: UUID;
  accountName: string;
  accountType: LedgerAccountType;
  /** The most recent day closed for this account, if any. */
  lastCloseDate: ISODateString | null;
  /** The first day that can still be closed: the day after the last close. */
  nextCloseDate: ISODateString;
  /** What the book says the account holds at the end of `nextCloseDate`. */
  expectedBalance: number;
  /** Entries on that day, so the counter can see what they are counting against. */
  movementCount: number;
  /** What this drawer keeps back at close, used to suggest the handover. */
  retainedFloat: number;
}

// ---------------------------------------------------------------------
// Owner statements and variance
// ---------------------------------------------------------------------

/** Where an owner's cash came from: one drawer, over the period. */
export interface OwnerSourceRow {
  accountId: UUID;
  accountName: string;
  branchName: string | null;
  amount: number;
  /** How many day closes it came across. */
  handovers: number;
}

/** One owner's holding over a period, in the shape they would be shown it. */
export interface OwnerStatement {
  accountId: UUID;
  accountName: string;
  from: ISODateString;
  to: ISODateString;
  openingBalance: number;
  /** Taken in at day close, broken down by the drawer it came from. */
  takenFrom: OwnerSourceRow[];
  taken: number;
  /** Moved on into a bank account — the usual next step. */
  banked: number;
  /** Anything else that left: a supplier paid in cash, a expense met personally. */
  otherOut: number;
  closingBalance: number;
  /** Cancelled rows inside the period that are not being shown. */
  reversedHidden: number;
  entries: CashEntryItem[];
}

/** Every owner on one line — who is holding how much. */
export interface OwnerSummaryRow {
  accountId: UUID;
  accountName: string;
  openingBalance: number;
  taken: number;
  paidOut: number;
  closingBalance: number;
}

export interface OwnerSummary {
  from: ISODateString;
  to: ISODateString;
  rows: OwnerSummaryRow[];
  /** What all owners are holding between them at the end of the period. */
  totalHeld: number;
}

/** How one account's counts have gone over a period. */
export interface VarianceRow {
  accountId: UUID;
  accountName: string;
  branchName: string | null;
  daysCounted: number;
  daysBalanced: number;
  daysShort: number;
  daysOver: number;
  /** Positive magnitudes, so the two can be read against each other. */
  totalShort: number;
  totalOver: number;
  /** Over less short. Negative means the till has lost money on balance. */
  netVariance: number;
  /** The single worst day, which is usually the one worth asking about. */
  worstDate: ISODateString | null;
  worstVariance: number;
}

export interface VarianceReport {
  from: ISODateString;
  to: ISODateString;
  rows: VarianceRow[];
  netVariance: number;
}
