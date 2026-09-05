import {
  Alert,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatBoxPieces } from '@tiles-erp/shared';
import { useGatePass } from './gate-pass-api';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** What is on the vehicle, and how it compares with what the documents say. */
export function GatePassDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}): JSX.Element {
  const { data } = useGatePass(id);

  return (
    <Dialog open={id !== null} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{data?.gatePassNo ?? 'Gate pass'}</DialogTitle>
      <DialogContent>
        {data && (
          <Stack spacing={1.5}>
            <Typography variant="caption" color="text.secondary">
              {[
                data.customerNames.length > 1
                  ? `${data.customerNames.length} drops`
                  : (data.customerNames[0] ?? data.toBranchName),
                data.destination,
                data.transporterName,
                data.vehicleNumber,
                data.driverName,
                new Date(data.passDate).toLocaleDateString(),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>

            {data.hasShortLoad && (
              <Alert severity="warning">
                Some lines went out short of what their document says. The invoice stays partly
                dispatched until the rest follows on another pass.
              </Alert>
            )}
            {data.cancelReason && <Alert severity="error">Cancelled: {data.cancelReason}</Alert>}
            {data.deliveredAt && (
              <Alert severity="success">
                Received by {data.receivedByName}
                {data.receivedByPhone ? ` (${data.receivedByPhone})` : ''} on{' '}
                {new Date(data.deliveredAt).toLocaleString()}
                {data.podRemarks ? ` — ${data.podRemarks}` : ''}
              </Alert>
            )}
            {data.returnedAt && (
              <Alert severity="info">
                Samples came back on {new Date(data.returnedAt).toLocaleDateString()}.
              </Alert>
            )}
            {data.closedAt && (
              <Alert severity={data.cashVariance === 0 ? 'success' : 'warning'}>
                Trip closed {new Date(data.closedAt).toLocaleString()}
                {data.tripKm !== null ? ` · ${data.tripKm} km` : ''} · cash{' '}
                {money(data.cashHandedOver)}
                {data.cashVariance !== 0
                  ? ` (${data.cashVariance > 0 ? '+' : ''}${money(data.cashVariance)} against the drops)`
                  : ''}
                {data.closeRemarks ? ` — ${data.closeRemarks}` : ''}
              </Alert>
            )}
            {data.freightOutstanding > 0 && data.closedAt && (
              <Alert severity="warning">
                {money(data.freightOutstanding)} of freight came back uncollected.
              </Alert>
            )}

            {/* The round, in the order the driver drops it. */}
            {(data.documents ?? []).length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Drop</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Document</TableCell>
                    <TableCell>Address</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Freight</TableCell>
                    <TableCell align="right">Collected</TableCell>
                    <TableCell align="right">Still due</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.documents ?? []).map((document, index) => (
                    <TableRow key={document.id}>
                      <TableCell>{document.sequence || index + 1}</TableCell>
                      <TableCell>{document.customerName ?? '—'}</TableCell>
                      <TableCell>
                        <Stack>
                          <Typography variant="body2">{document.documentNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(document.documentDate).toLocaleDateString()}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>{document.deliveryAddress ?? '—'}</TableCell>
                      <TableCell align="right">{document.qtyBoxes}</TableCell>
                      <TableCell align="right">
                        {document.freightCharge > 0 ? money(document.freightCharge) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        {document.freightCollected > 0 ? money(document.freightCollected) : '—'}
                        {document.freightPaidAtBranch > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {money(document.freightPaidAtBranch)} at branch
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {document.freightOutstanding > 0 ? (
                          <Chip
                            label={money(document.freightOutstanding)}
                            size="small"
                            color="warning"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {document.documentValue > 0 ? money(document.documentValue) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Document</TableCell>
                  <TableCell>Godown</TableCell>
                  <TableCell>Batch / shade</TableCell>
                  <TableCell align="right">On the document</TableCell>
                  <TableCell align="right">Loaded</TableCell>
                  <TableCell align="right">Short</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.lines ?? []).map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Stack>
                        <Typography variant="body2">{line.productName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {line.productCode}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{line.documentNumber ?? '—'}</TableCell>
                    <TableCell>{line.godownName}</TableCell>
                    <TableCell>
                      {[line.batchNo, line.shade].filter(Boolean).join(' / ') || '—'}
                    </TableCell>
                    <TableCell align="right">
                      {line.docQtyBoxes > 0
                        ? formatBoxPieces(line.docQtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')
                        : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                    </TableCell>
                    <TableCell align="right">
                      {line.shortQtyBoxes > 0 ? (
                        <Chip
                          label={formatBoxPieces(
                            line.shortQtyBoxes,
                            line.piecesPerBox,
                            line.baseUom === 'PIECE',
                          )}
                          size="small"
                          color="warning"
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Stack direction="row" justifyContent="flex-end" spacing={3} flexWrap="wrap" useFlexGap>
              {data.hireCharge > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Hire {money(data.hireCharge)}
                  {data.advancePaid > 0 ? ` · advance ${money(data.advancePaid)}` : ''}
                </Typography>
              )}
              {data.freightToCollect > 0 && (
                <Typography variant="body2" color="info.main">
                  Driver collects {money(data.freightToCollect)}
                </Typography>
              )}
              {(data.chargedFreight > 0 || data.hireCharge > 0) && (
                <Typography variant="body2">
                  Charged {money(data.chargedFreight)} · margin {money(data.freightMargin)}
                </Typography>
              )}
              <Typography variant="subtitle2">{data.totalBoxes} boxes loaded</Typography>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
