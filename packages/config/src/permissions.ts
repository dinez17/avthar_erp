/**
 * Canonical permission catalogue used by the RBAC guard on the backend and by
 * route/menu gating on the frontend. Permissions follow the `<resource>:<action>`
 * convention. Only foundation-level permissions are defined here; business
 * modules register their own permissions when they are implemented.
 */
export const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSIONS = {
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  ROLE_CREATE: 'role:create',
  ROLE_READ: 'role:read',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  DEPARTMENT_CREATE: 'department:create',
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_UPDATE: 'department:update',
  DEPARTMENT_DELETE: 'department:delete',
  DEPARTMENT_MANAGE: 'department:manage',
  COMPANY_CREATE: 'company:create',
  COMPANY_READ: 'company:read',
  COMPANY_UPDATE: 'company:update',
  COMPANY_DELETE: 'company:delete',
  COMPANY_MANAGE: 'company:manage',
  BRANCH_CREATE: 'branch:create',
  BRANCH_READ: 'branch:read',
  BRANCH_UPDATE: 'branch:update',
  BRANCH_DELETE: 'branch:delete',
  BRANCH_MANAGE: 'branch:manage',
  GODOWN_CREATE: 'godown:create',
  GODOWN_READ: 'godown:read',
  GODOWN_UPDATE: 'godown:update',
  GODOWN_DELETE: 'godown:delete',
  GATE_CREATE: 'gate:create',
  GATE_READ: 'gate:read',
  GATE_UPDATE: 'gate:update',
  GATE_DELETE: 'gate:delete',
  RACK_CREATE: 'rack:create',
  RACK_READ: 'rack:read',
  RACK_UPDATE: 'rack:update',
  RACK_DELETE: 'rack:delete',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_READ: 'category:read',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',
  BRAND_CREATE: 'brand:create',
  BRAND_READ: 'brand:read',
  BRAND_UPDATE: 'brand:update',
  BRAND_DELETE: 'brand:delete',
  SERIES_CREATE: 'series:create',
  SERIES_READ: 'series:read',
  SERIES_UPDATE: 'series:update',
  SERIES_DELETE: 'series:delete',
  COLLECTION_CREATE: 'collection:create',
  COLLECTION_READ: 'collection:read',
  COLLECTION_UPDATE: 'collection:update',
  COLLECTION_DELETE: 'collection:delete',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_READ: 'product:read',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRICE_READ: 'price:read',
  PRICE_UPDATE: 'price:update',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',
  /// Lets an approver commit an order that breaches the customer's credit limit
  CUSTOMER_CREDIT_APPROVE: 'customer:creditApprove',
  SUPPLIER_CREATE: 'supplier:create',
  SUPPLIER_READ: 'supplier:read',
  SUPPLIER_UPDATE: 'supplier:update',
  SUPPLIER_DELETE: 'supplier:delete',
  TRANSPORTER_CREATE: 'transporter:create',
  TRANSPORTER_READ: 'transporter:read',
  TRANSPORTER_UPDATE: 'transporter:update',
  TRANSPORTER_DELETE: 'transporter:delete',
  VEHICLE_CREATE: 'vehicle:create',
  VEHICLE_READ: 'vehicle:read',
  VEHICLE_UPDATE: 'vehicle:update',
  VEHICLE_DELETE: 'vehicle:delete',
  DRIVER_CREATE: 'driver:create',
  DRIVER_READ: 'driver:read',
  DRIVER_UPDATE: 'driver:update',
  DRIVER_DELETE: 'driver:delete',
  STOCK_READ: 'stock:read',
  STOCK_OPENING: 'stock:opening',
  STOCK_ADJUST: 'stock:adjust',
  STOCK_TRANSFER: 'stock:transfer',
  /// Booking a transfer in at the destination godown, and noting what arrived short
  STOCK_TRANSFER_RECEIVE: 'stockTransfer:receive',
  /// Turning a transfer back before it arrives, which returns the stock to the source
  STOCK_TRANSFER_CANCEL: 'stockTransfer:cancel',
  PURCHASE_ORDER_CREATE: 'purchaseOrder:create',
  PURCHASE_ORDER_READ: 'purchaseOrder:read',
  PURCHASE_ORDER_UPDATE: 'purchaseOrder:update',
  PURCHASE_ORDER_APPROVE: 'purchaseOrder:approve',
  PURCHASE_ORDER_CANCEL: 'purchaseOrder:cancel',
  GRN_CREATE: 'grn:create',
  GRN_READ: 'grn:read',
  PURCHASE_INVOICE_CREATE: 'purchaseInvoice:create',
  PURCHASE_INVOICE_READ: 'purchaseInvoice:read',
  PURCHASE_INVOICE_POST: 'purchaseInvoice:post',
  PURCHASE_RETURN_CREATE: 'purchaseReturn:create',
  PURCHASE_RETURN_READ: 'purchaseReturn:read',
  PURCHASE_RETURN_POST: 'purchaseReturn:post',
  QUOTATION_CREATE: 'quotation:create',
  QUOTATION_READ: 'quotation:read',
  QUOTATION_UPDATE: 'quotation:update',
  QUOTATION_APPROVE: 'quotation:approve',
  /** Allows quoting below a product's minimum selling price. */
  QUOTATION_OVERRIDE_PRICE: 'quotation:overridePrice',
  /// Selling for less than the goods cost.
  ///
  /// Deliberately separate from the price override above. A branch minimum is typed by a
  /// person and can itself be set below landing cost by mistake — when that happens the
  /// override lets a loss through without anyone deciding to take one.
  SELL_BELOW_COST: 'sales:sellBelowCost',

  /// Asking for a credit exception on a document that breached the customer's terms.
  CREDIT_APPROVAL_REQUEST: 'creditApproval:request',
  /// Deciding one. Three rungs, each with a ceiling from `credit.approvalLevels`, so how
  /// far past a limit somebody may wave a document through is a role question rather than
  /// a single yes-or-no permission.
  CREDIT_APPROVE_L1: 'creditApproval:approveL1',
  CREDIT_APPROVE_L2: 'creditApproval:approveL2',
  CREDIT_APPROVE_L3: 'creditApproval:approveL3',

  SALES_ORDER_CREATE: 'salesOrder:create',
  SALES_ORDER_READ: 'salesOrder:read',
  SALES_ORDER_UPDATE: 'salesOrder:update',
  SALES_ORDER_DELETE: 'salesOrder:delete',
  /// Confirming reserves stock; cancelling releases it
  SALES_ORDER_CONFIRM: 'salesOrder:confirm',
  SALES_ORDER_CANCEL: 'salesOrder:cancel',

  SALES_INVOICE_CREATE: 'salesInvoice:create',
  SALES_INVOICE_READ: 'salesInvoice:read',
  SALES_INVOICE_UPDATE: 'salesInvoice:update',
  SALES_INVOICE_DELETE: 'salesInvoice:delete',
  /// Posting takes the goods out of stock; cancelling puts them back
  SALES_INVOICE_POST: 'salesInvoice:post',
  SALES_INVOICE_CANCEL: 'salesInvoice:cancel',

  RECEIPT_CREATE: 'receipt:create',
  RECEIPT_READ: 'receipt:read',
  RECEIPT_UPDATE: 'receipt:update',
  RECEIPT_DELETE: 'receipt:delete',
  /// Posting settles invoices; cancelling un-settles them
  RECEIPT_POST: 'receipt:post',
  RECEIPT_CANCEL: 'receipt:cancel',
  /// The customer statement and the outstanding ageing report
  CUSTOMER_LEDGER_READ: 'customer:ledgerRead',

  SUPPLIER_PAYMENT_CREATE: 'supplierPayment:create',
  SUPPLIER_PAYMENT_READ: 'supplierPayment:read',
  SUPPLIER_PAYMENT_UPDATE: 'supplierPayment:update',
  SUPPLIER_PAYMENT_DELETE: 'supplierPayment:delete',
  /// Posting settles bills and spends debit notes; cancelling puts both back
  SUPPLIER_PAYMENT_POST: 'supplierPayment:post',
  SUPPLIER_PAYMENT_CANCEL: 'supplierPayment:cancel',
  /// The supplier statement and the payables ageing report
  SUPPLIER_LEDGER_READ: 'supplier:ledgerRead',

  /// Cash boxes and bank accounts
  LEDGER_ACCOUNT_MANAGE: 'ledgerAccount:manage',
  EXPENSE_HEAD_MANAGE: 'expenseHead:manage',
  /// Reading the cash book and the day's position
  CASH_BOOK_READ: 'cashBook:read',
  /// Typing an expense, a transfer between accounts, or a manual entry
  CASH_ENTRY_CREATE: 'cashEntry:create',
  /// Reversing one, which writes a contra row rather than deleting anything
  CASH_ENTRY_REVERSE: 'cashEntry:reverse',

  /// Counting a drawer at the end of the day and locking it
  CASH_COUNT_CLOSE: 'cashCount:close',
  /// Unlocking a closed day, which supervisors need and clerks should not have
  CASH_COUNT_REOPEN: 'cashCount:reopen',

  GATE_PASS_CREATE: 'gatePass:create',
  GATE_PASS_READ: 'gatePass:read',
  GATE_PASS_UPDATE: 'gatePass:update',
  GATE_PASS_DELETE: 'gatePass:delete',
  /// Confirming the load is checked and the vehicle may go to the gate
  GATE_PASS_LOAD: 'gatePass:load',
  /// Letting the vehicle out — the security desk's own permission
  GATE_PASS_GATE_OUT: 'gatePass:gateOut',
  /// Recording proof of delivery, and a returnable sample coming back
  GATE_PASS_DELIVER: 'gatePass:deliver',
  /// Closing the trip on the vehicle's return: odometer, collections and cash counted in
  GATE_PASS_CLOSE: 'gatePass:close',
  GATE_PASS_CANCEL: 'gatePass:cancel',
  /// The four dispatch reports: freight, vehicles, drivers and the delivery backlog
  DISPATCH_REPORT_READ: 'dispatchReport:read',
  /// What drivers are carrying, and the handovers that clear it
  DRIVER_CASH_READ: 'driverCash:read',
  /// Taking cash off a driver at the counter
  DRIVER_CASH_RECEIVE: 'driverCash:receive',

  /// The overview dashboard and the sales reports behind it
  DASHBOARD_READ: 'dashboard:read',
  /// The GST summary behind the returns
  GST_REPORT_READ: 'gstReport:read',
  /// Margin: what was sold against what it cost. Kept separate from sales reporting,
  /// because who may see a total is not who may see the mark-up on it.
  PROFIT_REPORT_READ: 'profitReport:read',

  /// CRM: the leads a salesperson or telecaller works towards a quotation
  CRM_LEAD_CREATE: 'crmLead:create',
  CRM_LEAD_READ: 'crmLead:read',
  CRM_LEAD_UPDATE: 'crmLead:update',
  CRM_LEAD_DELETE: 'crmLead:delete',
  /// Turning a worked lead into a draft quotation on the quotation desk. Kept separate
  /// from update because opening a priced document is a heavier act than editing a note,
  /// and it draws on the same pricing rights the quotation desk itself enforces.
  CRM_LEAD_CONVERT: 'crmLead:convert',

  /// Telecalling: logging a call against a lead, reading the call history, and removing a
  /// mislogged call. Logging can move the lead's follow-up and stage as a side effect.
  CRM_CALL_CREATE: 'crmCall:create',
  CRM_CALL_READ: 'crmCall:read',
  CRM_CALL_DELETE: 'crmCall:delete',

  /// Marketing campaigns and the spend-to-return report. Reading is needed to attribute a
  /// lead to a campaign; the rest is the marketer's or manager's.
  CRM_CAMPAIGN_CREATE: 'crmCampaign:create',
  CRM_CAMPAIGN_READ: 'crmCampaign:read',
  CRM_CAMPAIGN_UPDATE: 'crmCampaign:update',
  CRM_CAMPAIGN_DELETE: 'crmCampaign:delete',

  /// Field sales visits scheduled and reported against a lead. Completing one can move the
  /// lead's follow-up and stage, like a call does.
  CRM_VISIT_CREATE: 'crmVisit:create',
  CRM_VISIT_READ: 'crmVisit:read',
  CRM_VISIT_UPDATE: 'crmVisit:update',
  CRM_VISIT_DELETE: 'crmVisit:delete',

  /// Provisioning portal logins: granting and revoking a supplier's or customer's access to
  /// their own portal. The portal endpoints themselves are gated by account membership, not
  /// by a permission, so an external user never needs one of these.
  PORTAL_ACCOUNT_MANAGE: 'portalAccount:manage',

  /// SixOrbit: holding the credentials, reading the sync log, and pushing a record across.
  /// Three rather than one, because the person who watches a failed sync and retries it is
  /// rarely the person trusted with the accounting system's password.
  SIXORBIT_CONFIGURE: 'sixorbit:configure',
  SIXORBIT_READ: 'sixorbit:read',
  SIXORBIT_SYNC: 'sixorbit:sync',

  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = (typeof PERMISSIONS)[PermissionKey];

export const ALL_PERMISSIONS: PermissionValue[] = Object.values(PERMISSIONS);
