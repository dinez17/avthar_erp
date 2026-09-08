/**
 * Primary navigation.
 *
 * Sixty destinations in one flat list is not a menu, it is a directory: nothing
 * indicates which module you are in, related screens sit apart, and finding
 * "Purchase returns" means reading most of the list. They are grouped by the
 * workflow that owns them instead — the order a document actually travels
 * (quotation → order → invoice → collection), not alphabetical.
 *
 * Only the group carries an icon. Forty-two distinct glyphs on leaf items read as
 * noise rather than as wayfinding; the group icon is what the eye anchors to, and
 * the indented text beneath it is read, not scanned.
 */

/** Icon keys are resolved to MUI icons in the Sidebar. */
export type NavIconKey =
  | 'dashboard'
  | 'sales'
  | 'purchase'
  | 'inventory'
  | 'dispatch'
  | 'accounts'
  | 'crm'
  | 'masters'
  | 'admin';

/** A destination. Disabled items are on the roadmap but not built yet. */
export interface NavLeaf {
  label: string;
  path: string;
  disabled?: boolean;
}

export interface NavGroup {
  /** Stable key for persisting which groups the user left open. */
  id: string;
  label: string;
  icon: NavIconKey;
  items: NavLeaf[];
}

export interface NavSection {
  /** Small uppercase heading above a run of groups. */
  eyebrow: string;
  groups: NavGroup[];
}

/** Sits above the sections, always visible, never collapsible. */
export const NAV_HOME: { label: string; path: string; icon: NavIconKey } = {
  label: 'Dashboard',
  path: '/',
  icon: 'dashboard',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    eyebrow: 'Operations',
    groups: [
      {
        id: 'sales',
        label: 'Sales',
        icon: 'sales',
        items: [
          { label: 'Quotations', path: '/quotations' },
          { label: 'Sales orders', path: '/sales-orders' },
          { label: 'Sales invoices', path: '/sales-invoices' },
          { label: 'Collections', path: '/collections' },
          { label: 'Outstanding', path: '/outstanding' },
          { label: 'Customer ledger', path: '/customer-ledger' },
        ],
      },
      {
        id: 'purchase',
        label: 'Purchase',
        icon: 'purchase',
        items: [
          { label: 'Purchase orders', path: '/purchase-orders' },
          { label: 'Goods receipts', path: '/goods-receipts' },
          { label: 'Purchase invoices', path: '/purchase-invoices' },
          { label: 'Purchase returns', path: '/purchase-returns' },
          { label: 'Supplier payments', path: '/supplier-payments' },
          { label: 'Payables', path: '/payables' },
          { label: 'Supplier ledger', path: '/supplier-ledger' },
        ],
      },
      {
        id: 'inventory',
        label: 'Inventory',
        icon: 'inventory',
        items: [
          { label: 'Stock', path: '/stock' },
          { label: 'Stock count', path: '/stock/count' },
          { label: 'Transfers', path: '/stock/transfers' },
          { label: 'Stock reports', path: '/stock/reports' },
          { label: 'Product audit', path: '/product-audit' },
        ],
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        icon: 'dispatch',
        items: [
          { label: 'Gate passes', path: '/gate-passes' },
          { label: 'Driver cash', path: '/driver-cash' },
          { label: 'Dispatch reports', path: '/dispatch-reports' },
        ],
      },
      {
        id: 'accounts',
        label: 'Accounts',
        icon: 'accounts',
        items: [
          { label: 'Cash & bank', path: '/accounts' },
          { label: 'Cash book', path: '/cash-book' },
          { label: 'Day close', path: '/day-close' },
          { label: 'Owner statement', path: '/owner-statement' },
          { label: 'Expense heads', path: '/expense-heads' },
          { label: 'GST summary', path: '/gst-summary' },
          { label: 'Purchase GST', path: '/purchase-gst' },
          { label: 'Profit', path: '/profit' },
        ],
      },
      {
        id: 'crm',
        label: 'CRM',
        icon: 'crm',
        items: [
          { label: 'Leads', path: '/crm' },
          { label: 'Campaigns', path: '/crm/campaigns' },
          { label: 'Sales visits', path: '/crm/visits' },
          { label: 'Customers', path: '/customers' },
          { label: 'Suppliers', path: '/suppliers' },
        ],
      },
    ],
  },
  {
    eyebrow: 'Configuration',
    groups: [
      {
        id: 'masters',
        label: 'Masters',
        icon: 'masters',
        items: [
          { label: 'Products', path: '/products' },
          { label: 'Purchase rates', path: '/products/rates' },
          { label: 'Selling prices', path: '/products/prices' },
          { label: 'Categories', path: '/catalog/categories' },
          { label: 'Brands', path: '/catalog/brands' },
          { label: 'Series', path: '/catalog/series' },
          { label: 'Collections', path: '/catalog/collections' },
          { label: 'Transporters', path: '/transporters' },
          { label: 'Vehicles', path: '/vehicles' },
          { label: 'Drivers', path: '/drivers' },
        ],
      },
      {
        id: 'administration',
        label: 'Administration',
        icon: 'admin',
        items: [
          { label: 'Users', path: '/users' },
          { label: 'Roles', path: '/roles' },
          { label: 'Departments', path: '/departments' },
          { label: 'Companies', path: '/organization/companies' },
          { label: 'Branches', path: '/organization/branches' },
          { label: 'Godowns', path: '/organization/godowns' },
          { label: 'Gates', path: '/organization/gates' },
          { label: 'Racks', path: '/organization/racks' },
          { label: 'Number series', path: '/number-series' },
          { label: 'Portal access', path: '/portal-access' },
          { label: 'Audit log', path: '/audit' },
          { label: 'SixOrbit', path: '/sixorbit' },
          { label: 'SixOrbit products', path: '/sixorbit/products' },
          { label: 'Sync console', path: '/sixorbit/sync-log' },
          { label: 'Settings', path: '/settings' },
        ],
      },
    ],
  },
];

/** Every destination, flattened, with the group that owns it. For breadcrumbs and search. */
export const NAV_ITEMS: (NavLeaf & { group: string })[] = [
  { label: NAV_HOME.label, path: NAV_HOME.path, group: 'Dashboard' },
  ...NAV_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
  ),
];

/**
 * The group owning a path, so the sidebar can open it on a cold load or a deep link.
 *
 * Longest match wins: "/stock/transfers" must not be answered by "/stock". An exact
 * match is preferred over a prefix so "/products" and "/products/rates" resolve
 * independently even when both exist.
 */
export const groupIdForPath = (pathname: string): string | null => {
  let bestId: string | null = null;
  let bestLength = -1;

  for (const section of NAV_SECTIONS) {
    for (const group of section.groups) {
      for (const item of group.items) {
        const exact = item.path === pathname;
        const prefix = pathname.startsWith(`${item.path}/`);
        if ((exact || prefix) && item.path.length > bestLength) {
          bestId = group.id;
          bestLength = item.path.length;
        }
      }
    }
  }

  return bestId;
};
