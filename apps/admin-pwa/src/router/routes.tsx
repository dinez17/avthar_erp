import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { LoginPage } from '../pages/auth/LoginPage';
import { OverviewPage } from '../pages/OverviewPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { UsersPage } from '../features/users/UsersPage';
import { RolesPage } from '../features/roles/RolesPage';
import { DepartmentsPage } from '../features/departments/DepartmentsPage';
import { OrgEntityPage } from '../features/organization/OrgEntityPage';
import { ORG_ENTITIES } from '../features/organization/config';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AuditLogPage } from '../features/audit/AuditLogPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { CatalogEntityPage } from '../features/catalog/CatalogEntityPage';
import { CATALOG_ENTITIES } from '../features/catalog/config';
import { ProductsPage } from '../features/products/ProductsPage';
import { PurchaseRatesPage } from '../features/products/PurchaseRatesPage';
import { SellingPricesPage } from '../features/products/SellingPricesPage';
import { ProductAuditPage } from '../features/products/ProductAuditPage';
import { ProfitReportPage } from '../features/sales/ProfitReportPage';
import { PartyEntityPage } from '../features/parties/PartyEntityPage';
import { PARTY_ENTITIES } from '../features/parties/config';
import { LogisticsPage } from '../features/logistics/LogisticsPage';
import { LOGISTICS_ENTITIES } from '../features/logistics/config';
import { StockPage } from '../features/inventory/StockPage';
import { StockCountPage } from '../features/inventory/StockCountPage';
import { TransfersPage } from '../features/inventory/TransfersPage';
import { TransferPrintPage } from '../features/inventory/TransferPrintPage';
import { StockReportsPage } from '../features/inventory/StockReportsPage';
import { PurchaseOrdersPage } from '../features/purchase/PurchaseOrdersPage';
import { GoodsReceiptsPage } from '../features/purchase/GoodsReceiptsPage';
import { PurchaseInvoicesPage } from '../features/purchase/PurchaseInvoicesPage';
import { PurchaseReturnsPage } from '../features/purchase/PurchaseReturnsPage';
import { PurchaseGstPage } from '../features/purchase/PurchaseGstPage';
import { SupplierPaymentsPage } from '../features/purchase/SupplierPaymentsPage';
import { SupplierLedgerPage } from '../features/purchase/SupplierLedgerPage';
import { PayablesPage } from '../features/purchase/PayablesPage';
import { NumberSeriesPage } from '../features/settings/NumberSeriesPage';
import { SixOrbitSettingsPage } from '../features/sixorbit/SixOrbitSettingsPage';
import { ProductImportPage } from '../features/sixorbit/ProductImportPage';
import { SyncConsolePage } from '../features/sixorbit/SyncConsolePage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { CashBookPage } from '../features/accounts/CashBookPage';
import { DayClosePage } from '../features/accounts/DayClosePage';
import { ExpenseHeadsPage } from '../features/accounts/ExpenseHeadsPage';
import { OwnerStatementPage } from '../features/accounts/OwnerStatementPage';
import { QuotationsPage } from '../features/sales/QuotationsPage';
import { QuotationEntryPage } from '../features/sales/QuotationEntryPage';
import { QuotationPrintPage } from '../features/sales/QuotationPrintPage';
import { ReceiptPrintPage } from '../features/sales/ReceiptPrintPage';
import { SalesInvoicePrintPage } from '../features/sales/SalesInvoicePrintPage';
import { CollectionsPage } from '../features/sales/CollectionsPage';
import { CustomerLedgerPage } from '../features/sales/CustomerLedgerPage';
import { GstSummaryPage } from '../features/sales/GstSummaryPage';
import { OutstandingPage } from '../features/sales/OutstandingPage';
import { SalesInvoicesPage } from '../features/sales/SalesInvoicesPage';
import { SalesOrdersPage } from '../features/sales/SalesOrdersPage';
import { GatePassesPage } from '../features/dispatch/GatePassesPage';
import { GatePassEntryPage } from '../features/dispatch/GatePassEntryPage';
import { GatePassPrintPage } from '../features/dispatch/GatePassPrintPage';
import { DispatchReportsPage } from '../features/dispatch/DispatchReportsPage';
import { DriverCashPage } from '../features/dispatch/DriverCashPage';
import { LeadsPage } from '../features/crm/LeadsPage';
import { CampaignsPage } from '../features/crm/CampaignsPage';
import { SalesVisitsPage } from '../features/crm/SalesVisitsPage';
import { PortalAccessPage } from '../features/portal/PortalAccessPage';

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          // Printable documents render bare: no sidebar, header or breadcrumb.
          { path: 'quotations/:id/print', element: <QuotationPrintPage /> },
          { path: 'sales-invoices/:id/print', element: <SalesInvoicePrintPage /> },
          { path: 'receipts/:id/print', element: <ReceiptPrintPage /> },
          { path: 'gate-passes/:id/print', element: <GatePassPrintPage /> },
          { path: 'stock/transfers/:id/print', element: <TransferPrintPage /> },
          {
            element: <DashboardLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'roles', element: <RolesPage /> },
              { path: 'departments', element: <DepartmentsPage /> },
              {
                path: 'organization/companies',
                element: <OrgEntityPage config={ORG_ENTITIES['companies']!} />,
              },
              {
                path: 'organization/branches',
                element: <OrgEntityPage config={ORG_ENTITIES['branches']!} />,
              },
              {
                path: 'organization/godowns',
                element: <OrgEntityPage config={ORG_ENTITIES['godowns']!} />,
              },
              {
                path: 'organization/gates',
                element: <OrgEntityPage config={ORG_ENTITIES['gates']!} />,
              },
              {
                path: 'organization/racks',
                element: <OrgEntityPage config={ORG_ENTITIES['racks']!} />,
              },
              {
                path: 'catalog/categories',
                element: <CatalogEntityPage config={CATALOG_ENTITIES['categories']!} />,
              },
              {
                path: 'catalog/brands',
                element: <CatalogEntityPage config={CATALOG_ENTITIES['brands']!} />,
              },
              {
                path: 'catalog/series',
                element: <CatalogEntityPage config={CATALOG_ENTITIES['series']!} />,
              },
              {
                path: 'catalog/collections',
                element: <CatalogEntityPage config={CATALOG_ENTITIES['collections']!} />,
              },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/rates', element: <PurchaseRatesPage /> },
              { path: 'products/prices', element: <SellingPricesPage /> },
              { path: 'product-audit', element: <ProductAuditPage /> },
              { path: 'profit', element: <ProfitReportPage /> },
              {
                path: 'customers',
                element: <PartyEntityPage config={PARTY_ENTITIES['customers']!} />,
              },
              {
                path: 'suppliers',
                element: <PartyEntityPage config={PARTY_ENTITIES['suppliers']!} />,
              },
              {
                path: 'transporters',
                element: <LogisticsPage config={LOGISTICS_ENTITIES['transporters']!} />,
              },
              {
                path: 'vehicles',
                element: <LogisticsPage config={LOGISTICS_ENTITIES['vehicles']!} />,
              },
              {
                path: 'drivers',
                element: <LogisticsPage config={LOGISTICS_ENTITIES['drivers']!} />,
              },
              { path: 'stock', element: <StockPage /> },
              { path: 'stock/count', element: <StockCountPage /> },
              { path: 'stock/transfers', element: <TransfersPage /> },
              { path: 'stock/reports', element: <StockReportsPage /> },
              { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
              { path: 'goods-receipts', element: <GoodsReceiptsPage /> },
              { path: 'purchase-invoices', element: <PurchaseInvoicesPage /> },
              { path: 'purchase-returns', element: <PurchaseReturnsPage /> },
              { path: 'quotations', element: <QuotationsPage /> },
              { path: 'quotations/new', element: <QuotationEntryPage /> },
              { path: 'quotations/:id/edit', element: <QuotationEntryPage /> },
              { path: 'crm', element: <LeadsPage /> },
              { path: 'crm/campaigns', element: <CampaignsPage /> },
              { path: 'crm/visits', element: <SalesVisitsPage /> },
              { path: 'sales-orders', element: <SalesOrdersPage /> },
              { path: 'sales-invoices', element: <SalesInvoicesPage /> },
              { path: 'gate-passes', element: <GatePassesPage /> },
              { path: 'gate-passes/new', element: <GatePassEntryPage /> },
              { path: 'driver-cash', element: <DriverCashPage /> },
              { path: 'dispatch-reports', element: <DispatchReportsPage /> },
              { path: 'collections', element: <CollectionsPage /> },
              { path: 'outstanding', element: <OutstandingPage /> },
              { path: 'customer-ledger', element: <CustomerLedgerPage /> },
              { path: 'gst-summary', element: <GstSummaryPage /> },
              { path: 'purchase-gst', element: <PurchaseGstPage /> },
              { path: 'supplier-payments', element: <SupplierPaymentsPage /> },
              { path: 'supplier-ledger', element: <SupplierLedgerPage /> },
              { path: 'payables', element: <PayablesPage /> },
              { path: 'number-series', element: <NumberSeriesPage /> },
              { path: 'portal-access', element: <PortalAccessPage /> },
              { path: 'accounts', element: <AccountsPage /> },
              { path: 'cash-book', element: <CashBookPage /> },
              { path: 'day-close', element: <DayClosePage /> },
              { path: 'owner-statement', element: <OwnerStatementPage /> },
              { path: 'expense-heads', element: <ExpenseHeadsPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'sixorbit', element: <SixOrbitSettingsPage /> },
              { path: 'sixorbit/products', element: <ProductImportPage /> },
              { path: 'sixorbit/sync-log', element: <SyncConsolePage /> },
              { path: 'audit', element: <AuditLogPage /> },
              { path: 'profile', element: <ProfilePage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
