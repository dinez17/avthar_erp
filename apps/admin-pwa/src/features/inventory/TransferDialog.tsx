import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import EastIcon from '@mui/icons-material/East';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
  EWAY_BILL_THRESHOLD,
  needsEwayBill,
  splitBoxesPieces,
  transferDocumentType,
} from '@tiles-erp/shared';
import type { TransferLineInput } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import {
  useDriverOptions,
  useTransporterOptions,
  useVehicleOptions,
} from '../logistics/api';
import { useBranches } from '../products/branch-prices-api';
import { useGodowns, useStockBalances } from './api';
import { useCreateTransfer } from './transfers-api';

interface DraftLine {
  /** Identifies the source balance row: productId|batch|shade. */
  stockKey: string;
  boxes: string;
  pieces: string;
  /** Blank means "use the product's landing cost", which is the normal case. */
  rate: string;
}

const blankLine: DraftLine = { stockKey: '', boxes: '', pieces: '', rate: '' };

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  onPosted: (transferNo: string) => void;
}

/** Creates a transfer between two godowns, moving stock that exists at the source. */
export function TransferDialog({ open, onClose, onPosted }: TransferDialogProps): JSX.Element {
  const branches = useBranches();
  const [fromBranchId, setFromBranchId] = useState('');
  const [fromGodownId, setFromGodownId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [error, setError] = useState<string | null>(null);

  const [transporterId, setTransporterId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [freightCharge, setFreightCharge] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');

  const fromGodowns = useGodowns(fromBranchId || undefined);
  const toGodowns = useGodowns(toBranchId || undefined);
  const transporters = useTransporterOptions();
  const vehicles = useVehicleOptions(transporterId || undefined);
  const drivers = useDriverOptions(transporterId || undefined);
  const createTransfer = useCreateTransfer();

  const fromBranch = (branches.data ?? []).find((b) => b.id === fromBranchId);
  const toBranch = (branches.data ?? []).find((b) => b.id === toBranchId);

  // The document decides itself from the two GSTINs, and the server decides again on
  // post. Showing it here is so nobody is surprised by a tax invoice they did not expect.
  const documentType = transferDocumentType(fromBranch?.gstin, toBranch?.gstin);
  const taxable = documentType === 'TAX_INVOICE';

  // Source stock drives the product picker so only movable items are offered.
  const sourceStock = useStockBalances(
    { page: 1, pageSize: 200, sortOrder: 'asc' },
    { branchId: fromBranchId || undefined, godownId: fromGodownId || undefined },
    Boolean(fromBranchId && fromGodownId),
  );

  const available = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        qtyBoxes: number;
        piecesPerBox: number;
        productId: string;
        batchNo: string | null;
        shade: string | null;
        baseUom: string;
        landingCost: number;
        gstRate: number;
      }
    >();
    for (const item of sourceStock.data?.items ?? []) {
      if (item.qtyBoxes <= 0) continue;
      const key = `${item.productId}|${item.batchNo ?? ''}|${item.shade ?? ''}`;
      const dims = [item.batchNo, item.shade].filter(Boolean).join(' / ');
      const split = splitBoxesPieces(item.qtyBoxes, item.piecesPerBox);
      const onHand =
        item.baseUom === 'PIECE'
          ? `${Math.round(item.qtyPieces)} pcs`
          : `${split.boxes} box${split.pieces ? ` ${split.pieces} pcs` : ''}`;
      map.set(key, {
        label: `${item.sku} — ${item.productName}${dims ? ` (${dims})` : ''} · ${onHand}`,
        qtyBoxes: item.qtyBoxes,
        piecesPerBox: item.piecesPerBox,
        productId: item.productId,
        batchNo: item.batchNo,
        shade: item.shade,
        baseUom: item.baseUom,
        landingCost: item.landingCost,
        gstRate: item.gstRate,
      });
    }
    return map;
  }, [sourceStock.data]);

  /** What the consignment is worth, so the e-way bill warning can fire before posting. */
  const consignment = useMemo(() => {
    let value = 0;
    let tax = 0;
    for (const line of lines) {
      const source = line.stockKey ? available.get(line.stockKey) : undefined;
      if (!source) continue;
      const boxes = Number(line.boxes || 0);
      const pieces = Number(line.pieces || 0);
      const qtyBoxes = boxes + (source.piecesPerBox > 0 ? pieces / source.piecesPerBox : 0);
      const rate = line.rate === '' ? source.landingCost : Number(line.rate);
      const lineValue = qtyBoxes * (Number.isFinite(rate) ? rate : 0);
      value += lineValue;
      if (taxable) tax += (lineValue * source.gstRate) / 100;
    }
    return { value: Math.round(value * 100) / 100, tax: Math.round(tax * 100) / 100 };
  }, [lines, available, taxable]);

  const consignmentTotal = Math.round((consignment.value + consignment.tax) * 100) / 100;
  const ewayNeeded = needsEwayBill(consignmentTotal);

  const reset = (): void => {
    setLines([blankLine]);
    setRemarks('');
    setError(null);
    setTransporterId('');
    setVehicleId('');
    setDriverId('');
    setLrNumber('');
    setFreightCharge('');
    setDistanceKm('');
    setEwayBillNo('');
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!fromBranchId || !fromGodownId || !toBranchId || !toGodownId) {
      setError('Choose both the source and destination godowns');
      return;
    }
    if (fromGodownId === toGodownId) {
      setError('Source and destination godowns must differ');
      return;
    }

    const payload: TransferLineInput[] = [];
    for (const line of lines) {
      if (!line.stockKey) continue;
      const source = available.get(line.stockKey);
      if (!source) continue;
      const boxes = Number(line.boxes || 0);
      const pieces = Number(line.pieces || 0);
      if (boxes <= 0 && pieces <= 0) {
        setError('Every line needs a quantity');
        return;
      }
      const requested = boxes + (source.piecesPerBox > 0 ? pieces / source.piecesPerBox : 0);
      if (requested > source.qtyBoxes) {
        setError(`Not enough stock for ${source.label.split(' — ')[0]}`);
        return;
      }
      payload.push({
        productId: source.productId,
        batchNo: source.batchNo,
        shade: source.shade,
        boxes,
        pieces,
        // Blank means "use the landing cost", which the server reads off the product.
        ...(line.rate === '' ? {} : { rate: Number(line.rate) }),
      });
    }
    if (payload.length === 0) {
      setError('Add at least one line');
      return;
    }

    try {
      const result = await createTransfer.mutateAsync({
        fromBranchId,
        fromGodownId,
        toBranchId,
        toGodownId,
        remarks: remarks || undefined,
        transporterId: transporterId || undefined,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        lrNumber: lrNumber || undefined,
        freightCharge: freightCharge ? Number(freightCharge) : undefined,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        ewayBillNo: ewayBillNo || undefined,
        lines: payload,
      });
      reset();
      onPosted(result.documentNo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post the transfer');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Dispatch a stock transfer</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="From branch"
              size="small"
              fullWidth={false}
              value={fromBranchId}
              onChange={(e) => {
                setFromBranchId(e.target.value);
                setFromGodownId('');
                setLines([blankLine]);
              }}
              sx={{ width: 180 }}
            >
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="From godown"
              size="small"
              fullWidth={false}
              value={fromGodownId}
              onChange={(e) => {
                setFromGodownId(e.target.value);
                setLines([blankLine]);
              }}
              disabled={!fromBranchId}
              sx={{ width: 170 }}
            >
              {(fromGodowns.data ?? []).map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>

            <EastIcon fontSize="small" color="action" />

            <TextField
              select
              label="To branch"
              size="small"
              fullWidth={false}
              value={toBranchId}
              onChange={(e) => {
                setToBranchId(e.target.value);
                setToGodownId('');
              }}
              sx={{ width: 180 }}
            >
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="To godown"
              size="small"
              fullWidth={false}
              value={toGodownId}
              onChange={(e) => setToGodownId(e.target.value)}
              disabled={!toBranchId}
              sx={{ width: 170 }}
            >
              {(toGodowns.data ?? []).map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {fromBranchId && toBranchId && (
            <Alert severity={taxable ? 'warning' : 'info'} icon={<DescriptionIcon />}>
              {taxable ? (
                <>
                  <strong>Tax invoice.</strong> {fromBranch?.name} and {toBranch?.name} are
                  registered under different GSTINs, so this move is a supply: tax is charged, it
                  lands in {fromBranch?.name}&rsquo;s GSTR-1, and {toBranch?.name} claims the
                  credit.
                </>
              ) : (
                <>
                  <strong>Delivery challan.</strong> Both godowns sit under one GSTIN, so this is
                  not a supply. The document states a value for the road but charges no tax.
                </>
              )}
            </Alert>
          )}

          <Divider />
          <Typography variant="subtitle2">Items</Typography>

          {!fromGodownId ? (
            <Alert severity="info">Choose the source godown to list its stock.</Alert>
          ) : (
            <>
              {lines.map((line, index) => {
                const source = line.stockKey ? available.get(line.stockKey) : undefined;
                const isPiece = source?.baseUom === 'PIECE';
                return (
                  <Stack key={index} direction="row" spacing={1} alignItems="center">
                    <TextField
                      select
                      label="Item"
                      size="small"
                      fullWidth={false}
                      value={line.stockKey}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, stockKey: e.target.value } : l,
                          ),
                        )
                      }
                      sx={{ width: 420 }}
                    >
                      {[...available.entries()].map(([key, item]) => (
                        <MenuItem key={key} value={key}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Box"
                      type="number"
                      size="small"
                      fullWidth={false}
                      disabled={isPiece}
                      value={isPiece ? '' : line.boxes}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, boxes: e.target.value } : l)),
                        )
                      }
                      sx={{ width: 100 }}
                    />
                    <TextField
                      label="Pcs"
                      type="number"
                      size="small"
                      fullWidth={false}
                      value={line.pieces}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, pieces: e.target.value } : l)),
                        )
                      }
                      sx={{ width: 90 }}
                    />
                    <TextField
                      label="Rate"
                      type="number"
                      size="small"
                      fullWidth={false}
                      value={line.rate}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, rate: e.target.value } : l)),
                        )
                      }
                      placeholder={source ? String(source.landingCost) : ''}
                      helperText={source ? 'Landing cost' : ' '}
                      sx={{ width: 120 }}
                    />
                    <IconButton
                      aria-label="Remove line"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      disabled={lines.length === 1}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
              <Button
                startIcon={<AddIcon />}
                onClick={() => setLines((prev) => [...prev, blankLine])}
                sx={{ alignSelf: 'flex-start' }}
              >
                Add line
              </Button>
            </>
          )}

          {consignmentTotal > 0 && (
            <Stack direction="row" spacing={3} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Value ₹{money(consignment.value)}
              </Typography>
              {taxable && (
                <Typography variant="body2" color="text.secondary">
                  Tax ₹{money(consignment.tax)}
                </Typography>
              )}
              <Typography variant="body2" fontWeight={700}>
                Consignment ₹{money(consignmentTotal)}
              </Typography>
            </Stack>
          )}

          <Divider />
          <Typography variant="subtitle2">Transport</Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="Transporter"
              size="small"
              fullWidth={false}
              value={transporterId}
              onChange={(e) => {
                setTransporterId(e.target.value);
                setVehicleId('');
                setDriverId('');
              }}
              sx={{ width: 190 }}
            >
              <MenuItem value="">Own vehicle</MenuItem>
              {(transporters.data ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Vehicle"
              size="small"
              fullWidth={false}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              sx={{ width: 170 }}
            >
              <MenuItem value="">Not recorded</MenuItem>
              {(vehicles.data ?? []).map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.number}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Driver"
              size="small"
              fullWidth={false}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              sx={{ width: 170 }}
            >
              <MenuItem value="">Not recorded</MenuItem>
              {(drivers.data ?? []).map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="LR number"
              size="small"
              fullWidth={false}
              value={lrNumber}
              onChange={(e) => setLrNumber(e.target.value)}
              sx={{ width: 150 }}
            />
            <TextField
              label="Freight cost"
              type="number"
              size="small"
              fullWidth={false}
              value={freightCharge}
              onChange={(e) => setFreightCharge(e.target.value)}
              helperText="What the lorry costs you"
              sx={{ width: 150 }}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <TextField
              label="Distance (km)"
              type="number"
              size="small"
              fullWidth={false}
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              sx={{ width: 150 }}
            />
            <TextField
              label="E-way bill no"
              size="small"
              fullWidth={false}
              value={ewayBillNo}
              onChange={(e) => setEwayBillNo(e.target.value)}
              error={ewayNeeded && !ewayBillNo}
              helperText={
                ewayNeeded && !ewayBillNo
                  ? `Over ₹${EWAY_BILL_THRESHOLD.toLocaleString('en-IN')} — generate one`
                  : ' '
              }
              sx={{ width: 200 }}
            />
          </Stack>

          <TextField
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={createTransfer.isPending}
        >
          {createTransfer.isPending ? 'Dispatching…' : 'Dispatch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
