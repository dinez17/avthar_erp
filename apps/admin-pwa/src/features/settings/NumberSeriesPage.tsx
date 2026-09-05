import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { formatDocumentNumber, financialYearOf, isValidPrefix } from '@tiles-erp/shared';
import { PageContainer } from '@tiles-erp/ui';
import type { DocumentType, NumberSeriesItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useNumberSeries, useSaveNumberSeriesBulk } from './number-series-api';

const LABELS: Record<DocumentType, string> = {
  QUOTATION: 'Quotation',
  SALES_ORDER: 'Sales order',
  SALES_INVOICE: 'Sales invoice',
  RECEIPT: 'Receipt',
  PURCHASE_ORDER: 'Purchase order',
  GOODS_RECEIPT: 'Goods receipt',
  PURCHASE_INVOICE: 'Purchase invoice',
  PURCHASE_RETURN: 'Purchase return',
  SUPPLIER_PAYMENT: 'Supplier payment',
  STOCK_TRANSFER: 'Stock transfer',
  TRANSFER_CHALLAN: 'Transfer — delivery challan',
  TRANSFER_INVOICE: 'Transfer — tax invoice',
  GATE_PASS: 'Gate pass',
  DRIVER_CASH_HANDOVER: 'Driver cash handover',
  TRANSPORTER: 'Transporter code',
  DRIVER: 'Driver code',
  CASH_ENTRY: 'Cash entry',
  EXPENSE: 'Expense voucher',
  CASH_COUNT: 'Day close',
  CREDIT_APPROVAL: 'Credit request',
};

const GROUPS: { title: string; types: DocumentType[] }[] = [
  { title: 'Sales', types: ['QUOTATION', 'SALES_ORDER', 'SALES_INVOICE', 'RECEIPT'] },
  {
    title: 'Purchase',
    types: [
      'PURCHASE_ORDER',
      'GOODS_RECEIPT',
      'PURCHASE_INVOICE',
      'PURCHASE_RETURN',
      'SUPPLIER_PAYMENT',
    ],
  },
  { title: 'Stock', types: ['STOCK_TRANSFER', 'TRANSFER_CHALLAN', 'TRANSFER_INVOICE'] },
  { title: 'Dispatch', types: ['GATE_PASS', 'DRIVER_CASH_HANDOVER'] },
  { title: 'Cash & bank — company-wide', types: ['CASH_ENTRY', 'EXPENSE', 'CASH_COUNT', 'CREDIT_APPROVAL'] },
  { title: 'Masters — company-wide', types: ['TRANSPORTER', 'DRIVER'] },
];

/**
 * Series counted once for the whole company, whatever branch is selected.
 *
 * Must match COMPANY_WIDE in document-number.service.ts. Giving one of these a branch
 * prefix would print a number the counter never scoped by branch, so "apply to all"
 * leaves them alone.
 */
const COMPANY_WIDE: DocumentType[] = [
  'TRANSPORTER',
  'DRIVER',
  'CASH_ENTRY',
  'EXPENSE',
  'CASH_COUNT',
  'CREDIT_APPROVAL',
];

/** One row as it is being edited. */
interface Draft {
  prefix: string;
  separator: string;
  padding: number;
  resetAnnually: boolean;
}

const draftOf = (item: NumberSeriesItem): Draft => ({
  prefix: item.prefix,
  separator: item.separator,
  padding: item.padding,
  resetAnnually: item.resetAnnually,
});

/** Trailing separators are stripped, so typing "AMB-" does not produce "AMB--QT". */
const branchBase = (prefix: string): string => prefix.trim().replace(/[-_\s]+$/, '');

const same = (a: Draft, b: Draft): boolean =>
  a.prefix === b.prefix &&
  a.separator === b.separator &&
  a.padding === b.padding &&
  a.resetAnnually === b.resetAnnually;

/**
 * Branch-wise document numbering, edited as one sheet.
 *
 * Every prefix is typed in place and saved together. Setting up a branch means changing
 * sixteen prefixes at once, and doing that through sixteen dialogs is a chore nobody
 * finishes — so the whole table is the form, and one button commits it.
 */
export function NumberSeriesPage(): JSX.Element {
  const branches = useBranches();
  const [branchId, setBranchId] = useState<string>('');
  const series = useNumberSeries(branchId || null);
  const saveBulk = useSaveNumberSeriesBulk();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reload the sheet whenever the branch changes or the server answers.
  useEffect(() => {
    if (!series.data) return;
    setDrafts(Object.fromEntries(series.data.map((item) => [item.documentType, draftOf(item)])));
    setError(null);
  }, [series.data]);

  const byType = useMemo(
    () => new Map((series.data ?? []).map((item) => [item.documentType, item])),
    [series.data],
  );

  const changed = useMemo(
    () =>
      Object.entries(drafts).filter(([type, draft]) => {
        const item = byType.get(type as DocumentType);
        return item ? !same(draft, draftOf(item)) : false;
      }),
    [drafts, byType],
  );

  const invalid = changed.filter(([, draft]) => !isValidPrefix(draft.prefix));
  const financialYear = financialYearOf(new Date());

  const set = (type: DocumentType, patch: Partial<Draft>): void =>
    setDrafts((previous) => ({ ...previous, [type]: { ...previous[type]!, ...patch } }));

  /**
   * Fills the branch prefix across every document — how a branch is actually set up.
   *
   * Each row keeps its own document code: AMB-QT, AMB-SO, AMB-INV. Without the code every
   * document at the branch would share one prefix, so a quotation and an invoice would
   * both read AMB/26-27/0001 — the same string on two different pieces of paper, which is
   * exactly what a document number exists to prevent.
   */
  const applyToAll = (prefix: string, withCode: boolean): void => {
    const base = branchBase(prefix);
    if (!base) return;
    setDrafts((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([type, draft]) => {
          // Company-wide masters are not per branch, so they are left alone.
          if (COMPANY_WIDE.includes(type as DocumentType)) return [type, draft];
          const code = byType.get(type as DocumentType)?.defaultPrefix ?? '';
          return [type, { ...draft, prefix: withCode && code ? `${base}-${code}` : base }];
        }),
      ),
    );
  };

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await saveBulk.mutateAsync({
        branchId: branchId || null,
        series: changed.map(([type, draft]) => ({
          documentType: type as DocumentType,
          ...draft,
        })),
      });
      setNotice(`${changed.length} series saved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Those could not be saved');
    }
  };

  const [bulkPrefix, setBulkPrefix] = useState('');
  const [withCode, setWithCode] = useState(true);

  /** What "Apply to all" would produce, shown on the button before it is pressed. */
  const bulkSample = (() => {
    const base = branchBase(bulkPrefix) || 'AMB';
    return withCode ? `${base}-INV` : base;
  })();

  return (
    <PageContainer
      title="Number series"
      subtitle="How each branch numbers its documents. The count restarts every 1 April."
      actions={
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            sx={{ width: 220 }}
          >
            <MenuItem value="">All branches (default)</MenuItem>
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={changed.length === 0 || invalid.length > 0 || saveBulk.isPending}
            onClick={() => void submit()}
          >
            {saveBulk.isPending
              ? 'Saving…'
              : changed.length > 0
                ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`
                : 'Save'}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2">Set every prefix at once</Typography>
            <TextField
              size="small"
              label="Prefix"
              placeholder="e.g. AMB"
              value={bulkPrefix}
              onChange={(e) => setBulkPrefix(e.target.value)}
              sx={{ width: 160 }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={withCode}
                  onChange={(e) => setWithCode(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Keep document code</Typography>}
            />
            <Chip
              label={bulkSample}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace' }}
            />
            <Button
              variant="outlined"
              disabled={!branchBase(bulkPrefix)}
              onClick={() => applyToAll(bulkPrefix, withCode)}
            >
              Apply to all
            </Button>
            <Button
              color="inherit"
              startIcon={<RestartAltIcon />}
              disabled={changed.length === 0}
              onClick={() =>
                setDrafts(
                  Object.fromEntries(
                    (series.data ?? []).map((item) => [item.documentType, draftOf(item)]),
                  ),
                )
              }
            >
              Discard changes
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%' }}>
              Each document keeps the code that tells it apart — AMB-QT, AMB-SO, AMB-INV,
              AMB-RCPT. Turn the switch off and every document at this branch shares one prefix,
              so a quotation and an invoice would print the same number. Nothing is written
              until you press Save; transporter and driver codes are company-wide and are left
              alone.
            </Typography>
          </Stack>
        </Paper>

        {invalid.length > 0 && (
          <Alert severity="error">
            {invalid.map(([type]) => LABELS[type as DocumentType]).join(', ')}:
            a prefix must be 1–12 characters, start with a letter or digit, and contain no
            slashes.
          </Alert>
        )}

        {GROUPS.map((group) => (
          <Paper key={group.title} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              {group.title}
            </Typography>
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '26%' }}>Document</TableCell>
                  <TableCell sx={{ width: 150 }}>Prefix</TableCell>
                  <TableCell sx={{ width: 90 }}>Sep</TableCell>
                  <TableCell sx={{ width: 90 }}>Digits</TableCell>
                  <TableCell sx={{ width: 130 }}>Yearly</TableCell>
                  <TableCell>Next number</TableCell>
                  <TableCell align="right">Issued</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {group.types.map((type) => {
                  const item = byType.get(type);
                  const draft = drafts[type];
                  if (!item || !draft) return null;

                  const edited = !same(draft, draftOf(item));
                  const bad = edited && !isValidPrefix(draft.prefix);
                  const preview = formatDocumentNumber(
                    { ...draft, prefix: draft.prefix || '…' },
                    item.issuedThisYear + 1,
                    financialYear,
                  );

                  return (
                    <TableRow key={type} hover selected={edited}>
                      <TableCell>
                        {LABELS[type]}
                        {item.isDefault && !edited && (
                          <Tooltip title="Not set — using the built-in default">
                            <Chip
                              label="default"
                              size="small"
                              variant="outlined"
                              sx={{ ml: 0.5 }}
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={draft.prefix}
                          onChange={(e) => set(type, { prefix: e.target.value })}
                          error={bad}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={draft.separator}
                          onChange={(e) => set(type, { separator: e.target.value })}
                          fullWidth
                        >
                          <MenuItem value="/">/</MenuItem>
                          <MenuItem value="-">-</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={draft.padding}
                          onChange={(e) => set(type, { padding: Number(e.target.value) })}
                          fullWidth
                        >
                          {[3, 4, 5, 6].map((width) => (
                            <MenuItem key={width} value={width}>
                              {width}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          sx={{ m: 0 }}
                          control={
                            <Switch
                              size="small"
                              checked={draft.resetAnnually}
                              onChange={(e) => set(type, { resetAnnually: e.target.checked })}
                            />
                          }
                          label={
                            <Typography variant="caption">
                              {draft.resetAnnually ? 'Resets' : 'Continuous'}
                            </Typography>
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontFamily="monospace"
                          color={edited ? 'primary.main' : 'text.primary'}
                        >
                          {preview}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {item.issuedThisYear > 0 ? (
                          <Tooltip title="Already issued this year — changing the prefix splits the series">
                            <Chip
                              label={item.issuedThisYear}
                              size="small"
                              color={edited ? 'warning' : 'default'}
                              variant="outlined"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        ))}

        <Typography variant="caption" color="text.secondary">
          A branch with no series of its own falls back to the company-wide one, and then to the
          built-in default. Documents already issued keep the numbers they were given; only new
          ones use a changed prefix — so a prefix with a count against it leaves that year&rsquo;s
          series in two halves, which an auditor will ask about.
        </Typography>
      </Stack>
    </PageContainer>
  );
}
