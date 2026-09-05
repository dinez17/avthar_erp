/** Icon keys are resolved to MUI icons in the Sidebar. Disabled items denote modules
 *  that are part of the ERP roadmap but not yet implemented in this foundation build. */
export type NavIconKey =
  | 'overview'
  | 'users'
  | 'roles'
  | 'departments'
  | 'company'
  | 'branch'
  | 'godown'
  | 'gate'
  | 'rack'
  | 'audit'
  | 'category'
  | 'brand'
  | 'series'
  | 'collection'
  | 'rates'
  | 'prices'
  | 'transporter'
  | 'vehicle'
  | 'driver'
  | 'count'
  | 'transfer'
  | 'purchase'
  | 'grn'
  | 'invoice'
  | 'return'
  | 'quotation'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'invoices'
  | 'payments'
  | 'documents'
  | 'customers'
  | 'suppliers'
  | 'crm'
  | 'campaign'
  | 'visit'
  | 'logistics'
  | 'reports'
  | 'portal'
  | 'settings';

export interface NavItem {
  label: string;
  path: string;
  icon: NavIconKey;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/', icon: 'overview' },
  { label: 'Users', path: '/users', icon: 'users' },
  { label: 'Roles', path: '/roles', icon: 'roles' },
  { label: 'Departments', path: '/departments', icon: 'departments' },
  { label: 'Companies', path: '/organization/companies', icon: 'company' },
  { label: 'Branches', path: '/organization/branches', icon: 'branch' },
  { label: 'Godowns', path: '/organization/godowns', icon: 'godown' },
  { label: 'Gates', path: '/organization/gates', icon: 'gate' },
  { label: 'Racks', path: '/organization/racks', icon: 'rack' },
  { label: 'Categories', path: '/catalog/categories', icon: 'category' },
  { label: 'Brands', path: '/catalog/brands', icon: 'brand' },
  { label: 'Series', path: '/catalog/series', icon: 'series' },
  { label: 'Collections', path: '/catalog/collections', icon: 'collection' },
  { label: 'Products', path: '/products', icon: 'products' },
  { label: 'Purchase rates', path: '/products/rates', icon: 'rates' },
  { label: 'Selling prices', path: '/products/prices', icon: 'prices' },
  { label: 'Stock', path: '/stock', icon: 'inventory' },
  { label: 'Stock count', path: '/stock/count', icon: 'count' },
  { label: 'Transfers', path: '/stock/transfers', icon: 'transfer' },
  { label: 'Stock reports', path: '/stock/reports', icon: 'reports' },
  { label: 'Purchase orders', path: '/purchase-orders', icon: 'purchase' },
  { label: 'Goods receipts', path: '/goods-receipts', icon: 'grn' },
  { label: 'Purchase invoices', path: '/purchase-invoices', icon: 'invoice' },
  { label: 'Purchase returns', path: '/purchase-returns', icon: 'return' },
  { label: 'Supplier payments', path: '/supplier-payments', icon: 'payments' },
  { label: 'Payables', path: '/payables', icon: 'payments' },
  { label: 'Supplier ledger', path: '/supplier-ledger', icon: 'reports' },
  { label: 'Cash & bank', path: '/accounts', icon: 'payments' },
  { label: 'Cash book', path: '/cash-book', icon: 'reports' },
  { label: 'Day close', path: '/day-close', icon: 'count' },
  { label: 'Owner statement', path: '/owner-statement', icon: 'reports' },
  { label: 'Expense heads', path: '/expense-heads', icon: 'settings' },
  { label: 'Quotations', path: '/quotations', icon: 'quotation' },
  { label: 'Sales orders', path: '/sales-orders', icon: 'orders' },
  { label: 'Sales invoices', path: '/sales-invoices', icon: 'invoices' },
  { label: 'Gate passes', path: '/gate-passes', icon: 'logistics' },
  { label: 'Driver cash', path: '/driver-cash', icon: 'payments' },
  { label: 'Dispatch reports', path: '/dispatch-reports', icon: 'reports' },
  { label: 'Collections', path: '/collections', icon: 'payments' },
  { label: 'Outstanding', path: '/outstanding', icon: 'payments' },
  { label: 'Customer ledger', path: '/customer-ledger', icon: 'reports' },
  { label: 'GST summary', path: '/gst-summary', icon: 'reports' },
  { label: 'Purchase GST', path: '/purchase-gst', icon: 'reports' },
  { label: 'Profit', path: '/profit', icon: 'reports' },
  { label: 'Product audit', path: '/product-audit', icon: 'products' },
  { label: 'Customers', path: '/customers', icon: 'customers' },
  { label: 'Suppliers', path: '/suppliers', icon: 'suppliers' },
  { label: 'CRM', path: '/crm', icon: 'crm' },
  { label: 'Campaigns', path: '/crm/campaigns', icon: 'campaign' },
  { label: 'Sales visits', path: '/crm/visits', icon: 'visit' },
  { label: 'Transporters', path: '/transporters', icon: 'transporter' },
  { label: 'Vehicles', path: '/vehicles', icon: 'vehicle' },
  { label: 'Drivers', path: '/drivers', icon: 'driver' },

  { label: 'Audit log', path: '/audit', icon: 'audit' },
  { label: 'Number series', path: '/number-series', icon: 'settings' },
  { label: 'Portal access', path: '/portal-access', icon: 'portal' },
  { label: 'SixOrbit', path: '/sixorbit', icon: 'settings' },
  { label: 'SixOrbit products', path: '/sixorbit/products', icon: 'products' },
  { label: 'Sync console', path: '/sixorbit/sync-log', icon: 'reports' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];
