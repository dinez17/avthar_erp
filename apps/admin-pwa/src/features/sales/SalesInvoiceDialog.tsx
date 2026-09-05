import CallSplitIcon from '@mui/icons-material/CallSplit';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { calculatePurchaseLine, formatBoxPieces } from '@tiles-erp/shared';
import { useSaveShortcut } from '@tiles-erp/ui';
import type { InvoiceableLine, SalesInvoiceLineInput, SalesOrderItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useCreateSalesInvoice, useInvoiceableLines } from './invoices-api';
import { useSplitInvoices } from './orders-api';

interface SalesInvoiceDialogProps {
  open: boolean;
  order: SalesOrderItem | null;
  onClose: () => void;
  /** The finished sentence to show, since one action can raise several invoices. */
  onCreated: (message: string) => void;
}

/** A draft line: how much of the pending quantity to bill, and where it ships from. */
interface DraftLine {
  boxes: string;
  pieces: string;
  godownKey: string;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sourceKey = (source: InvoiceableLine['sources'][number]): string =>
  `${source.godownId}|${source.batchNo ?? ''}|${source.shade ?? ''}`;

const sourceLabel = (line: InvoiceableLine, source: InvoiceableLine['sources'][number]): string => {
  const free = formatBoxPieces(source.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE');
  return `${source.godownName}${source.batchNo ? ` · ${source.batchNo}` : ''} (${free} free)`;
};

/**
 * Raises an invoice against a confirmed order. Quantities default to everything still
 * pending, so the common case — bill the whole order — is one click.
 */
export function SalesInvoiceDialog({
  open,
  order,
  onClose,
  onCreated,
}: SalesInvoiceDialogProps): JSX.Element {
  const pending = useInvoiceableLines(open && order ? order.id : null);
  const createInvoice = useCreateSalesInvoice();
  const split = useSplitInvoices();

  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Only this branch's stock may appear.
   *
   * An invoice belongs to one branch and can only issue that branch's goods. Offering
   * another branch's godown here produced an invoice that looked right and failed at
   * posting, because the balance it wanted is keyed to the branch that actually holds it.
   */
  const lines = useMemo(
    () =>
      (pending.data ?? [])
        .filter((line) => line.pendingQtyBoxes > 0)
        .map((line) => ({
          ...line,
          sources: line.sources.filter((source) => source.branchId === order?.branchId),
        })),
    [pending.data, order?.branchId],
  );

  /** Reserved for this order, but held by a branch this invoice cannot bill. */
  const otherBranches = useMemo(() => {
    const names = new Set<string>();
    for (const line of pending.data ?? []) {
      for (const source of line.sources) {
        if (source.branchId !== order?.branchId) names.add(source.branchName);
      }
    }
    return [...names];
  }, [pending.data, order?.branchId]);

  /** Nothing this branch can ship, though the order is not finished. */
  const nothingHere = lines.length > 0 && lines.every((line) => line.sources.length === 0);

  // Default to billing everything outstanding from the first godown holding it.
  useEffect(() => {
    if (lines.length === 0) return;
    setDrafts((previous) => {
      if (Object.keys(previous).length > 0) return previous;
      const next: Record<string, DraftLine> = {};
      for (const line of lines) {
        const perBox = line.piecesPerBox > 0 ? line.piecesPerBox : 1;
        const pieceOnly = line.baseUom === 'PIECE';
        const boxes = pieceOnly ? 0 : Math.floor(line.pendingQtyBoxes);
        const pieces = Math.round((line.pendingQtyBoxes - boxes) * perBox);
        next[line.salesOrderLineId] = {
          boxes: pieceOnly ? '' : String(boxes),
          pieces: pieces > 0 ? String(pieces) : '',
          godownKey: line.sources[0] ? sourceKey(line.sources[0]) : '',
        };
      }
      return next;
    });
  }, [lines]);

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setRemarks('');
      setError(null);
    }
  }, [open]);

  const setDraft = (id: string, patch: Partial<DraftLine>): void =>
    setDrafts((previous) => ({
      ...previous,
      [id]: { boxes: '', pieces: '', godownKey: '', ...previous[id], ...patch },
    }));

  const computed = lines.map((line) => {
    const draft = drafts[line.salesOrderLineId];
    const perBox = line.piecesPerBox > 0 ? line.piecesPerBox : 1;
    const qtyBoxes = round3(
      Number(draft?.boxes || 0) + Number(draft?.pieces || 0) / perBox,
    );
    const amounts = calculatePurchaseLine(qtyBoxes, line.rate, line.discountPct, line.gstRate);
    const overBilled = qtyBoxes > line.pendingQtyBoxes + 0.0005;
    return { line, draft, qtyBoxes, ...amounts, overBilled };
  });

  const billed = computed.filter((entry) => entry.qtyBoxes > 0);
  const subTotal = billed.reduce((sum, entry) => sum + entry.lineSubTotal, 0);
  const gstAmount = billed.reduce((sum, entry) => sum + entry.lineGst, 0);
  const grandTotal = billed.reduce((sum, entry) => sum + entry.lineTotal, 0);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!order) return;
    if (billed.length === 0) {
      setError('Enter a quantity on at least one line');
      return;
    }
    const overBilled = computed.find((entry) => entry.overBilled);
    if (overBilled) {
      setError(
        `${overBilled.line.productName}: only ${formatBoxPieces(
          overBilled.line.pendingQtyBoxes,
          overBilled.line.piecesPerBox,
          overBilled.line.baseUom === 'PIECE',
        )} left to invoice`,
      );
      return;
    }

    const payload: SalesInvoiceLineInput[] = [];
    for (const entry of billed) {
      const source = entry.line.sources.find((item) => sourceKey(item) === entry.draft?.godownKey);
      if (!source) {
        setError(`${entry.line.productName}: choose the godown to ship from`);
        return;
      }
      payload.push({
        productId: entry.line.productId,
        salesOrderLineId: entry.line.salesOrderLineId,
        godownId: source.godownId,
        batchNo: source.batchNo,
        shade: source.shade,
        boxes: Number(entry.draft?.boxes || 0),
        pieces: Number(entry.draft?.pieces || 0),
        rate: entry.line.rate,
        discountPct: entry.line.discountPct,
        gstRate: entry.line.gstRate,
      });
    }

    try {
      const invoice = await createInvoice.mutateAsync({
        customerId: order.customerId,
        branchId: order.branchId,
        salesOrderId: order.id,
        invoiceDate: new Date(invoiceDate).toISOString(),
        freightCharge: order.freightCharge,
        unloadingCharge: order.unloadingCharge,
        loadingCharge: order.loadingCharge,
        remarks: remarks.trim() || undefined,
        lines: payload,
      });
      onCreated(`${invoice.invoiceNumber} created as a draft. Post it to issue the stock.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the invoice');
    }
  };

  /**
   * Cuts one draft per supplying branch instead of one at this branch.
   *
   * Offered right here rather than only on the order, because this is where the problem
   * is discovered: being told the goods are in another branch and then having to go and
   * find the button is a worse answer than the button.
   */
  const raiseSplit = async (): Promise<void> => {
    if (!order) return;
    setError(null);
    try {
      const result = await split.mutateAsync({ salesOrderId: order.id });
      const raised = result.invoices
        .map((invoice) => `${invoice.invoiceNumber} (${invoice.branchName})`)
        .join(', ');
      onCreated(
        result.invoices.length === 1
          ? `${raised} drafted. Post it to take the stock out.`
          : `${result.invoices.length} drafts raised: ${raised}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The invoices could not be raised');
    }
  };

  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Invoice {order?.orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {otherBranches.length > 0 && (
            <Alert severity={nothingHere ? 'warning' : 'info'}>
              {nothingHere ? (
                <>
                  Everything still pending on this order is held by{' '}
                  <strong>{otherBranches.join(', ')}</strong>, and {order?.branchName} cannot
                  invoice another branch&rsquo;s stock. Use{' '}
                  <strong>Raise invoices per branch</strong> below — it bills each supplying
                  branch under its own GSTIN.
                </>
              ) : (
                <>
                  Part of this order is held by <strong>{otherBranches.join(', ')}</strong> and is
                  not shown below. Bill just {order?.branchName}&rsquo;s share here, or use{' '}
                  <strong>Raise invoices per branch</strong> to bill every branch at once.
                </>
              )}
            </Alert>
          )}
          {lines.length === 0 && !pending.isLoading && (
            <Alert severity="info">Everything on this order has already been invoiced.</Alert>
          )}

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Invoice date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              sx={{ width: 190 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {order?.customerName} · {order?.branchName}
            </Typography>
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Ordered</TableCell>
                <TableCell align="right">Pending</TableCell>
                <TableCell align="right">Box</TableCell>
                <TableCell align="right">Pcs</TableCell>
                <TableCell>Ship from</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {computed.map((entry) => (
                <TableRow key={entry.line.salesOrderLineId}>
                  <TableCell>
                    {entry.line.productName}
                    {entry.line.sizeMm && (
                      <Typography variant="caption" color="text.secondary">
                        {' '}
                        · {entry.line.sizeMm}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatBoxPieces(
                      entry.line.orderedQtyBoxes,
                      entry.line.piecesPerBox,
                      entry.line.baseUom === 'PIECE',
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatBoxPieces(
                      entry.line.pendingQtyBoxes,
                      entry.line.piecesPerBox,
                      entry.line.baseUom === 'PIECE',
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      error={entry.overBilled}
                      disabled={entry.line.baseUom === 'PIECE'}
                      value={entry.line.baseUom === 'PIECE' ? '' : (entry.draft?.boxes ?? '')}
                      onChange={(e) =>
                        setDraft(entry.line.salesOrderLineId, { boxes: e.target.value })
                      }
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      error={entry.overBilled}
                      value={entry.draft?.pieces ?? ''}
                      onChange={(e) =>
                        setDraft(entry.line.salesOrderLineId, { pieces: e.target.value })
                      }
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={entry.draft?.godownKey ?? ''}
                      onChange={(e) =>
                        setDraft(entry.line.salesOrderLineId, { godownKey: e.target.value })
                      }
                      sx={{ minWidth: 200 }}
                    >
                      {entry.line.sources.map((source) => (
                        <MenuItem key={sourceKey(source)} value={sourceKey(source)}>
                          {sourceLabel(entry.line, source)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">{money(entry.line.rate)}</TableCell>
                  <TableCell align="right">{money(entry.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TextField
            label="Remarks"
            size="small"
            multiline
            minRows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          <Stack direction="row" spacing={3} justifyContent="flex-end">
            <Typography variant="body2">Sub total {money(subTotal)}</Typography>
            <Typography variant="body2">GST {money(gstAmount)}</Typography>
            <Typography variant="subtitle2">Invoice total {money(grandTotal)}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Charges from the order are added when the invoice is created. The invoice starts as a
            draft; posting it takes the stock out.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        {otherBranches.length > 0 && (
          <Button
            variant={nothingHere ? 'contained' : 'outlined'}
            startIcon={<CallSplitIcon />}
            onClick={() => void raiseSplit()}
            disabled={split.isPending}
          >
            {split.isPending ? 'Raising…' : 'Raise invoices per branch'}
          </Button>
        )}
        {!nothingHere && (
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={createInvoice.isPending || lines.length === 0}
          >
            {createInvoice.isPending ? 'Creating…' : 'Create draft invoice'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
