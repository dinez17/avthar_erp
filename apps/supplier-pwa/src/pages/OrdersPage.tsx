import {
  Alert,
  Button,
  Chip,
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
import { useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { PoAckStatus, SupplierPortalOrder } from '@tiles-erp/shared-types';
import { ApiError } from '../lib/api-client';
import { SupplierSwitcher, usePortal } from '../portal/PortalProvider';
import { money, useAcknowledgeOrder, useSupplierOrder, useSupplierOrders } from '../portal/api';

const ACK_COLORS: Record<PoAckStatus, 'warning' | 'success' | 'info'> = {
  PENDING: 'warning',
  ACKNOWLEDGED: 'success',
  QUERIED: 'info',
};

const ACK_LABELS: Record<PoAckStatus, string> = {
  PENDING: 'Awaiting you',
  ACKNOWLEDGED: 'Acknowledged',
  QUERIED: 'Queried',
};

const date = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

export function OrdersPage(): JSX.Element {
  const { activeSupplierId } = usePortal();
  const { data } = useSupplierOrders(activeSupplierId);
  const acknowledge = useAcknowledgeOrder(activeSupplierId);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [acking, setAcking] = useState<SupplierPortalOrder | null>(null);
  const [decision, setDecision] = useState<'ACKNOWLEDGED' | 'QUERIED'>('ACKNOWLEDGED');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useSupplierOrder(activeSupplierId, viewingId);
  const rows = data?.items ?? [];

  const submitAck = async (): Promise<void> => {
    if (!acking) return;
    setError(null);
    if (decision === 'QUERIED' && note.trim().length < 3) {
      setError('Add a note describing your query');
      return;
    }
    try {
      await acknowledge.mutateAsync({ orderId: acking.id, decision, note: note.trim() || undefined });
      setAcking(null);
      setNote('');
      setNotice(decision === 'ACKNOWLEDGED' ? 'Order acknowledged.' : 'Query sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <PageContainer title="Orders" subtitle="Purchase orders placed with you" actions={<SupplierSwitcher />}>
      <Stack spacing={1.5}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && !acking && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PO number</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Expected</TableCell>
              <TableCell>Branch</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Your response</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((order) => {
              const canAck = order.status === 'APPROVED' && order.ackStatus === 'PENDING';
              return (
                <TableRow key={order.id} hover>
                  <TableCell>{order.poNumber}</TableCell>
                  <TableCell>{date(order.orderDate)}</TableCell>
                  <TableCell>{date(order.expectedDate)}</TableCell>
                  <TableCell>{order.branchName}</TableCell>
                  <TableCell>{order.status.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <Chip label={ACK_LABELS[order.ackStatus]} size="small" color={ACK_COLORS[order.ackStatus]} />
                  </TableCell>
                  <TableCell align="right">{money(order.grandTotal)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setViewingId(order.id)}>
                      View
                    </Button>
                    {canAck && (
                      <Button
                        size="small"
                        variant="contained"
                        sx={{ ml: 1 }}
                        onClick={() => {
                          setAcking(order);
                          setDecision('ACKNOWLEDGED');
                          setNote('');
                          setError(null);
                        }}
                      >
                        Respond
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    No orders yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.poNumber ?? 'Order'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.branchName} · {date(detail.data.orderDate)}
                {detail.data.expectedDate ? ` · expected ${date(detail.data.expectedDate)}` : ''}
              </Typography>
              {detail.data.ackNote && (
                <Alert severity={detail.data.ackStatus === 'QUERIED' ? 'info' : 'success'}>
                  Your note: {detail.data.ackNote}
                </Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.data.lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell align="right">{line.qtyBoxes}</TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Typography variant="subtitle2" align="right">
                Total {money(detail.data.grandTotal)}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewingId(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={acking !== null} onClose={() => setAcking(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Respond to {acking?.poNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {error && acking && <Alert severity="error">{error}</Alert>}
            <TextField
              select
              label="Response"
              size="small"
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'ACKNOWLEDGED' | 'QUERIED')}
            >
              <MenuItem value="ACKNOWLEDGED">Acknowledge — I can supply this</MenuItem>
              <MenuItem value="QUERIED">Raise a query</MenuItem>
            </TextField>
            <TextField
              label={decision === 'QUERIED' ? 'Query *' : 'Note (optional)'}
              size="small"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setAcking(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void submitAck()} disabled={acknowledge.isPending}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
