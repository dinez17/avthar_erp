/** Icon keys are resolved to MUI icons in the Sidebar. Disabled items denote modules
 *  that are part of the ERP roadmap but not yet implemented in this foundation build. */
export type NavIconKey =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'invoices'
  | 'payments'
  | 'documents'
  | 'customers'
  | 'suppliers'
  | 'crm'
  | 'logistics'
  | 'reports'
  | 'settings';

export interface NavItem {
  label: string;
  path: string;
  icon: NavIconKey;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/', icon: 'overview' },
  { label: 'Orders', path: '/orders', icon: 'orders', disabled: true },
  { label: 'Invoices', path: '/invoices', icon: 'invoices', disabled: true },
  { label: 'Payments', path: '/payments', icon: 'payments', disabled: true },
  { label: 'Documents', path: '/documents', icon: 'documents', disabled: true },
];
