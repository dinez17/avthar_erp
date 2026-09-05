import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { formatBoxPieces, shortQty } from '@tiles-erp/shared';
import type { ReceiveTransferLineInput, StockTransferItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useReceiveTransfer } from './transfers-api';

interface ReceiveTransferDialogProps {
  transfer: StockTransferItem | null;
  onClose: () => void;
  onReceived: (documentNo: string) => void;
}

/**
 * Books a transfer in at the destination godown.
 *
 * Every line opens pre-filled with what was sent, because a full delivery is the normal
 * case and making someone retype twenty quantities to say "all fine" is how wrong numbers
 * get entered. Only what is changed is a claim about a shortage.
 */
export function ReceiveTransferDialog({
  transfer,
  onClose,
  onReceived,
}: ReceiveTransferDialogProps): JSX.Element {
  const [receivedByName, setReceivedByName] = useState('');
  const [receiptRemarks, setReceiptRemarks] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const receive = useReceiveTransfer();

  const lines = transfer?.lines ?? [];
  const keyOf = (line: { productId: string; batchNo: string | null; shade: string | null }): string =>
    `${line.productId}|${line.batchNo ?? ''}|${line.shade ?? ''}`;

  // Reopen on a different transfer and the counts start again from what was sent.
  useEffect(() => {
    if (!transfer) return;
    const seeded: Record<string, string> = {};
    for (const line of transfer.lines ?? []) seeded[keyOf(line)] = String(line.qtyBoxes);
    setCounts(seeded);
    setReceivedByName('');
    setReceiptRemarks('');
    setError(null);
  }, [transfer]);

  const totalShort = lines.reduce((sum, line) => {
    const counted = Number(counts[keyOf(line)] ?? line.qtyBoxes);
    return sum + (Number.isFinite(counted) ? shortQty(line.qtyBoxes, counted) : 0);
  }, 0);

  const submit = async (): Promise<void> => {
    if (!transfer) return;
    setError(null);
    if (!receivedByName.trim()) {
      setError('Enter the name of whoever is signing for the goods');
      return;
    }

    const payload: ReceiveTransferLineInput[] = [];
    for (const line of lines) {
      const raw = counts[keyOf(line)] ?? '';
      const counted = raw === '' ? line.qtyBoxes : Number(raw);
      if (!Number.isFinite(counted) || counted < 0) {
        setError(`${line.sku}: enter a valid quantity`);
        return;
      }
      if (counted > line.qtyBoxes) {
        setError(`${line.sku}: ${counted} counted against ${line.qtyBoxes} sent`);
        return;
      }
      // Only the lines that differ need sending; the rest are taken as received in full.
      if (counted !== line.qtyBoxes) {
        payload.push({
          productId: line.productId,
          batchNo: line.batchNo,
          shade: line.shade,
          qtyReceived: counted,
        });
      }
    }

    try {
      const result = await receive.mutateAsync({
        id: transfer.id,
        input: {
          receivedByName: receivedByName.trim(),
          receiptRemarks: receiptRemarks.trim() || undefined,
          lines: payload,
        },
      });
      onReceived(result.documentNo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The transfer could not be received');
    }
  };

  return (
    <Dialog open={transfer !== null} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Receive {transfer?.documentNo}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {transfer && (
            <Typography variant="caption" color="text.secondary">
              {transfer.fromBranchName} · {transfer.fromGodownName} → {transfer.toBranchName} ·{' '}
              {transfer.toGodownName}
              {transfer.vehicleNumber ? ` · ${transfer.vehicleNumber}` : ''}
              {transfer.driverName ? ` · ${transfer.driverName}` : ''}
            </Typography>
          )}

          <Alert severity="info">
            Every line is filled in with what was sent. Change only the lines that arrived
            short — what does not arrive is not booked into the godown.
          </Alert>

          <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Sent</TableCell>
                <TableCell align="right" sx={{ width: 140 }}>
                  Received
                </TableCell>
                <TableCell align="right" sx={{ width: 100 }}>
                  Short
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => {
                const key = keyOf(line);
                const counted = Number(counts[key] ?? line.qtyBoxes);
                const short = Number.isFinite(counted) ? shortQty(line.qtyBoxes, counted) : 0;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Typography variant="body2">{line.sku}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {line.productName}
                        {[line.batchNo, line.shade].filter(Boolean).length > 0 &&
                          ` · ${[line.batchNo, line.shade].filter(Boolean).join(' / ')}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        fullWidth={false}
                        value={counts[key] ?? ''}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        inputProps={{ style: { textAlign: 'right' } }}
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {short > 0 ? (
                        <Chip label={short} size="small" color="error" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalShort > 0 && (
            <Alert severity="warning">
              {totalShort} box{totalShort === 1 ? '' : 'es'} did not arrive. They are already out
              of {transfer?.fromGodownName} and will not be booked in here, so the loss stays
              visible against this transfer.
            </Alert>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              label="Received by"
              size="small"
              fullWidth={false}
              required
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              helperText="Whoever signed at the godown"
              sx={{ width: 240 }}
            />
            <TextField
              label="Remarks"
              size="small"
              fullWidth={false}
              value={receiptRemarks}
              onChange={(e) => setReceiptRemarks(e.target.value)}
              placeholder="Breakage, packing condition…"
              sx={{ width: 320 }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={receive.isPending}>
          {receive.isPending ? 'Receiving…' : 'Receive'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
