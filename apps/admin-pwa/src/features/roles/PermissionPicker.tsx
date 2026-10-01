import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

type Section = 'Sales' | 'Purchase' | 'Inventory' | 'Dispatch' | 'Accounts & reports' | 'CRM' | 'Products & parties' | 'Administration' | 'SixOrbit';
const SECTION_ORDER: Section[] = ['Sales', 'Purchase', 'Inventory', 'Dispatch', 'Accounts & reports', 'CRM', 'Products & parties', 'Administration', 'SixOrbit'];
const SECTION_RESOURCES: Record<Section, string[]> = {
  Sales: ['quotation', 'salesOrder', 'salesInvoice', 'receipt', 'customer', 'creditApproval', 'sales'],
  Purchase: ['purchaseOrder', 'grn', 'purchaseInvoice', 'purchaseReturn', 'supplierPayment', 'supplier'],
  Inventory: ['stock', 'stockTransfer'],
  Dispatch: ['gatePass', 'dispatchReport', 'driverCash'],
  'Accounts & reports': ['ledgerAccount', 'expenseHead', 'cashBook', 'cashEntry', 'cashCount', 'dashboard', 'gstReport', 'profitReport'],
  CRM: ['crmLead', 'crmCall', 'crmCampaign', 'crmVisit'],
  'Products & parties': ['product', 'price', 'category', 'brand', 'series', 'collection', 'transporter', 'vehicle', 'driver'],
  Administration: ['user', 'role', 'department', 'company', 'branch', 'godown', 'gate', 'rack', 'portalAccount', 'settings', 'audit'],
  SixOrbit: ['sixorbit'],
};
const RESOURCE_NAMES: Record<string, string> = {
  salesOrder: 'Sales orders', salesInvoice: 'Sales invoices', receipt: 'Collections',
  customer: 'Customers', supplierPayment: 'Supplier payments', purchaseOrder: 'Purchase orders',
  purchaseInvoice: 'Purchase invoices', purchaseReturn: 'Purchase returns', grn: 'Goods receipts',
  stock: 'Stock', stockTransfer: 'Stock transfers', gatePass: 'Gate passes',
  dispatchReport: 'Dispatch reports', driverCash: 'Driver cash', ledgerAccount: 'Cash and bank accounts',
  expenseHead: 'Expense heads', cashBook: 'Cash book', cashEntry: 'Cash entries', cashCount: 'Day close',
  dashboard: 'Dashboard', gstReport: 'GST reports', profitReport: 'Profit report',
  crmLead: 'Leads', crmCall: 'Calls', crmCampaign: 'Campaigns', crmVisit: 'Sales visits',
  price: 'Product prices', portalAccount: 'Portal access', sixorbit: 'SixOrbit',
  creditApproval: 'Credit approval',
};
const ACTION_NAMES: Record<string, string> = {
  read: 'View', create: 'Create', update: 'Edit', delete: 'Delete', manage: 'Manage',
  approve: 'Approve', cancel: 'Cancel', post: 'Post', confirm: 'Confirm',
  opening: 'Enter opening stock', adjust: 'Adjust stock', transfer: 'Transfer stock',
  receive: 'Receive', close: 'Close', reopen: 'Reopen', reverse: 'Reverse',
  load: 'Mark loaded', gateOut: 'Record gate exit', deliver: 'Record delivery',
  configure: 'Configure', sync: 'Sync', convert: 'Convert to quotation',
  ledgerRead: 'View ledger', creditApprove: 'Approve credit exception',
  overridePrice: 'Override minimum price', sellBelowCost: 'Sell below cost',
  request: 'Request approval', approveL1: 'First-level approval',
  approveL2: 'Second-level approval', approveL3: 'Final approval',
};

function splitCode(code: string): { resource: string; action: string } {
  const [resource = code, action = ''] = code.split(':');
  return { resource, action };
}
function words(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function label(code: string): string {
  const { resource, action } = splitCode(code);
  const name = RESOURCE_NAMES[resource] ?? words(resource);
  return `${ACTION_NAMES[action] ?? words(action)} ${name}`;
}
function sectionFor(code: string): Section {
  const { resource } = splitCode(code);
  return SECTION_ORDER.find((section) => SECTION_RESOURCES[section].includes(resource)) ?? 'Administration';
}

interface Props {
  codes: string[];
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

export function PermissionPicker({ codes, selected, onChange, disabled }: Props): JSX.Element {
  const [search, setSearch] = useState('');
  const groups = useMemo(() => SECTION_ORDER.map((section) => ({
    section,
    codes: codes.filter((code) => sectionFor(code) === section &&
      `${label(code)} ${code}`.toLowerCase().includes(search.trim().toLowerCase())),
  })).filter((group) => group.codes.length > 0), [codes, search]);
  const selectedSet = new Set(selected);

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2">Permissions · {selected.length} selected</Typography>
      <TextField
        size="small"
        label="Find a permission"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="For example: quotations, view, stock"
      />
      <Box sx={{ overflowX: 'hidden', pr: 0.5 }}>
        {groups.length === 0 && <Typography color="text.secondary">No matching permissions</Typography>}
        {groups.map(({ section, codes: groupCodes }) => {
          const count = groupCodes.filter((code) => selectedSet.has(code)).length;
          return (
            <Accordion key={section} disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ flex: 1, fontWeight: 600 }}>{section}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{count}/{groupCodes.length}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <FormControlLabel
                  label={`Select all ${section.toLowerCase()} permissions${search ? ' shown' : ''}`}
                  control={<Checkbox size="small" checked={count === groupCodes.length} indeterminate={count > 0 && count < groupCodes.length} disabled={disabled}
                    onChange={(event) => {
                      const rest = selected.filter((code) => !groupCodes.includes(code));
                      onChange(event.target.checked ? [...rest, ...groupCodes] : rest);
                    }} />}
                />
                <Stack sx={{ pl: { xs: 0, sm: 2 }, minWidth: 0 }}>
                  {groupCodes.map((code) => (
                    <FormControlLabel key={code} sx={{ mr: 0, minWidth: 0 }}
                      label={<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{label(code)}</Typography>}
                      control={<Checkbox size="small" checked={selectedSet.has(code)} disabled={disabled}
                        onChange={(event) => onChange(event.target.checked
                          ? [...selected, code]
                          : selected.filter((item) => item !== code))} />}
                    />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Stack>
  );
}
