import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBoxPieces, splitBoxesPieces } from '@tiles-erp/shared';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type {
  CreateGatePassInput,
  GatePassDocumentInput,
  GatePassLineInput,
  PendingDispatchInvoice,
  PendingDispatchLine,
} from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import {
  useDriverOptions,
  useTransporterOptions,
  useVehicleOptions,
} from '../logistics/api';
import { useBranches } from '../products/branch-prices-api';
import { useCreateGatePass, usePendingDispatch } from './gate-pass-api';

/** What the loader typed against one pending invoice line. */
interface LoadEntry {
  boxes: string;
  pieces: string;
}

/** A customer with goods waiting, as the round picker shows them. */
interface CustomerOption {
  id: string;
  name: string;
  invoiceCount: number;
  pendingQtyBoxes: number;
}

const key = (invoiceId: string, lineId: string): string => `${invoiceId}:${lineId}`;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Building a gate pass: pick the invoices going out, then say what actually went on the
 * vehicle.
 *
 * The invoices are grouped by customer, because one lorry doing a round drops at several
 * of them and the pass is built the way the round is planned — customer by customer, in
 * the order the driver will visit.
 *
 * The loaded quantity defaults to everything still pending, because a full load is the
 * common case and a short one is the exception worth typing.
 */
export function GatePassEntryPage(): JSX.Element {
  const navigate = useNavigate();
  const branches = useBranches();
  const transporters = useTransporterOptions();
  const createPass = useCreateGatePass();

  const [branchId, setBranchId] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [hireCharge, setHireCharge] = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [remarks, setRemarks] = useState('');
  /** Which customers the round is for. Empty means every one with something waiting. */
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  /** The freight agreed with each customer for their drop, keyed by invoice. */
  const [freight, setFreight] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [loads, setLoads] = useState<Record<string, LoadEntry>>({});
  const [error, setError] = useState<string | null>(null);

  // Narrowing the pickers to the chosen transporter is the usual case; leaving it blank
  // lists every lorry, because an own vehicle belongs to no transporter.
  const vehicles = useVehicleOptions(transporterId || undefined);
  const drivers = useDriverOptions(transporterId || undefined);
  const pending = usePendingDispatch(branchId || undefined);
  const invoices = pending.data ?? [];

  const vehicle = (vehicles.data ?? []).find((each) => each.id === vehicleId) ?? null;
  const driver = (drivers.data ?? []).find((each) => each.id === driverId) ?? null;
  const branchName = (branches.data ?? []).find((branch) => branch.id === branchId)?.name;

  /**
   * Every customer with something waiting at this branch, for the picker. Built from the
   * pending invoices rather than the customer master so the list is only the ones a pass
   * could actually be raised for.
   */
  const waiting = useMemo(() => {
    const seen = new Map<string, CustomerOption>();
    for (const invoice of invoices) {
      const option = seen.get(invoice.customerId) ?? {
        id: invoice.customerId,
        name: invoice.customerName,
        invoiceCount: 0,
        pendingQtyBoxes: 0,
      };
      option.invoiceCount += 1;
      option.pendingQtyBoxes = Math.round((option.pendingQtyBoxes + invoice.pendingQtyBoxes) * 1000) / 1000;
      seen.set(invoice.customerId, option);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  /**
   * The pending invoices of the chosen customers, one block each, in the order they were
   * picked — which is the order the driver will drop them.
   */
  const byCustomer = useMemo(
    () =>
      customerIds.map((customerId) => ({
        customerId,
        name: waiting.find((option) => option.id === customerId)?.name ?? '',
        invoices: invoices.filter((invoice) => invoice.customerId === customerId),
      })),
    [invoices, customerIds, waiting],
  );

  /** Fills in the full pending quantity for every line of an invoice, once. */
  const defaultLoads = (
    current: Record<string, LoadEntry>,
    invoice: PendingDispatchInvoice,
  ): Record<string, LoadEntry> => {
    const next = { ...current };
    for (const line of invoice.lines) {
      const id = key(invoice.salesInvoiceId, line.salesInvoiceLineId);
      if (next[id]) continue;
      const split = splitBoxesPieces(line.pendingQtyBoxes, line.piecesPerBox);
      next[id] = { boxes: String(split.boxes), pieces: String(split.pieces) };
    }
    return next;
  };

  /**
   * Ticking an invoice defaults every one of its lines to the full pending quantity, and
   * its freight to whatever the invoice already billed — so nothing is collected at the
   * door unless somebody says otherwise.
   */
  const toggleInvoice = (invoice: PendingDispatchInvoice): void => {
    setSelected((current) =>
      current.includes(invoice.salesInvoiceId)
        ? current.filter((id) => id !== invoice.salesInvoiceId)
        : [...current, invoice.salesInvoiceId],
    );
    setLoads((current) => defaultLoads(current, invoice));
    setFreight((current) =>
      current[invoice.salesInvoiceId] !== undefined
        ? current
        : { ...current, [invoice.salesInvoiceId]: String(invoice.freightCharge) },
    );
  };

  /** All of a customer's invoices at once — the usual way a drop is loaded. */
  const toggleCustomer = (group: PendingDispatchInvoice[], take: boolean): void => {
    const ids = group.map((invoice) => invoice.salesInvoiceId);
    setSelected((current) =>
      take
        ? [...current, ...ids.filter((id) => !current.includes(id))]
        : current.filter((id) => !ids.includes(id)),
    );
    if (take) {
      setLoads((current) => group.reduce(defaultLoads, current));
      setFreight((current) => {
        const next = { ...current };
        for (const invoice of group) {
          if (next[invoice.salesInvoiceId] === undefined) {
            next[invoice.salesInvoiceId] = String(invoice.freightCharge);
          }
        }
        return next;
      });
    }
  };

  const setLoad = (id: string, field: keyof LoadEntry, value: string): void => {
    setLoads((current) => ({
      ...current,
      [id]: { boxes: '', pieces: '', ...current[id], [field]: value },
    }));
  };

  /** What is loaded, in boxes, for one pending line. */
  const loadedQty = (invoice: PendingDispatchInvoice, line: PendingDispatchLine): number => {
    const entry = loads[key(invoice.salesInvoiceId, line.salesInvoiceLineId)];
    if (!entry) return 0;
    const boxes = Number(entry.boxes) || 0;
    const pieces = Number(entry.pieces) || 0;
    const perBox = line.piecesPerBox > 0 ? line.piecesPerBox : 1;
    return Math.round((boxes + pieces / perBox) * 1000) / 1000;
  };

  // Kept in the order they were ticked: that is the order the driver will drop them.
  const chosen = useMemo(
    () =>
      selected
        .map((id) => invoices.find((invoice) => invoice.salesInvoiceId === id))
        .filter((invoice): invoice is PendingDispatchInvoice => invoice !== undefined),
    [invoices, selected],
  );

  /** What this drop is charged, and how much of it is still due at the door. */
  const dropFreight = (invoice: PendingDispatchInvoice): { charge: number; toCollect: number } => {
    const charge = Number(freight[invoice.salesInvoiceId] ?? invoice.freightCharge) || 0;
    return { charge, toCollect: Math.max(0, Math.round((charge - invoice.freightCharge) * 100) / 100) };
  };

  const totals = useMemo(() => {
    let boxes = 0;
    let charged = 0;
    let toCollect = 0;
    for (const invoice of chosen) {
      const drop = dropFreight(invoice);
      charged += drop.charge;
      toCollect += drop.toCollect;
      for (const line of invoice.lines) boxes += loadedQty(invoice, line);
    }
    return {
      boxes: Math.round(boxes * 1000) / 1000,
      charged: Math.round(charged * 100) / 100,
      toCollect: Math.round(toCollect * 100) / 100,
      customers: new Set(chosen.map((invoice) => invoice.customerId)).size,
    };
  }, [chosen, loads, freight]);

  const canSave = branchId !== '' && chosen.length > 0 && totals.boxes > 0 && !createPass.isPending;

  const submit = (): void => {
    if (!canSave) return;
    setError(null);

    const documents: GatePassDocumentInput[] = chosen.map((invoice, index) => ({
      key: invoice.salesInvoiceId,
      salesInvoiceId: invoice.salesInvoiceId,
      sequence: index + 1,
      freightCharge: dropFreight(invoice).charge,
    }));

    const lines: GatePassLineInput[] = [];
    for (const invoice of chosen) {
      for (const line of invoice.lines) {
        const entry = loads[key(invoice.salesInvoiceId, line.salesInvoiceLineId)];
        if (loadedQty(invoice, line) <= 0) continue;
        lines.push({
          documentKey: invoice.salesInvoiceId,
          productId: line.productId,
          godownId: line.godownId,
          gateId: line.gateId ?? undefined,
          batchNo: line.batchNo ?? undefined,
          shade: line.shade ?? undefined,
          docQtyBoxes: line.pendingQtyBoxes,
          boxes: Number(entry?.boxes) || 0,
          pieces: Number(entry?.pieces) || 0,
        });
      }
    }

    const input: CreateGatePassInput = {
      type: 'SALES',
      branchId,
      transporterId: transporterId || undefined,
      vehicleId: vehicleId || undefined,
      driverId: driverId || undefined,
      vehicleNumber: vehicleId ? undefined : vehicleNumber.trim() || undefined,
      driverName: driverId ? undefined : driverName.trim() || undefined,
      driverPhone: driverId ? undefined : driverPhone.trim() || undefined,
      hireCharge: Number(hireCharge) || 0,
      advancePaid: Number(advancePaid) || 0,
      remarks: remarks.trim() || undefined,
      documents,
      lines,
    };

    void (async () => {
      try {
        const created = await createPass.mutateAsync(input);
        navigate('/gate-passes', { state: { created: created.gatePassNo } });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The gate pass could not be saved');
      }
    })();
  };

  useSaveShortcut(submit, canSave);

  return (
    <PageContainer
      title="New gate pass"
      subtitle="One lorry, any number of customers. Tick the invoices in drop order, then record what went on."
      actions={
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/gate-passes')}
          >
            Back
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!canSave} onClick={submit}>
            Save draft
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>
            Vehicle
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="Branch"
              size="small"
              required
              fullWidth={false}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                // Another branch has other customers and other stock waiting.
                setCustomerIds([]);
                setSelected([]);
              }}
              sx={{ width: 180 }}
            >
              {(branches.data ?? []).map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.name}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              size="small"
              options={transporters.data ?? []}
              value={(transporters.data ?? []).find((each) => each.id === transporterId) ?? null}
              onChange={(_, chosenTransporter) => {
                setTransporterId(chosenTransporter?.id ?? '');
                // The old lorry may not belong to the new transporter.
                setVehicleId('');
                setDriverId('');
              }}
              getOptionLabel={(each) => each.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField {...params} label="Transporter" helperText="Blank for an own vehicle" />
              )}
              sx={{ width: 220 }}
            />
            <Autocomplete
              size="small"
              options={vehicles.data ?? []}
              value={vehicle}
              onChange={(_, chosenVehicle) => {
                setVehicleId(chosenVehicle?.id ?? '');
                if (chosenVehicle?.transporterId) setTransporterId(chosenVehicle.transporterId);
              }}
              getOptionLabel={(each) => `${each.number} · ${each.type.toLowerCase()}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vehicle"
                  helperText={
                    vehicle?.capacityTons ? `${vehicle.capacityTons} t capacity` : 'From the master'
                  }
                />
              )}
              sx={{ width: 240 }}
            />
            <Autocomplete
              size="small"
              options={drivers.data ?? []}
              value={driver}
              onChange={(_, chosenDriver) => {
                setDriverId(chosenDriver?.id ?? '');
                if (chosenDriver?.transporterId) setTransporterId(chosenDriver.transporterId);
              }}
              getOptionLabel={(each) => `${each.name} · ${each.phone}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Driver"
                  helperText={driver?.licenseNumber ?? 'From the master'}
                />
              )}
              sx={{ width: 240 }}
            />

            {/*
              Who the lorry is going to. It sits with the vehicle because that is the order
              the round is decided in — the driver and the drops are one decision — and the
              invoices for whoever is picked appear underneath.
            */}
            <Autocomplete
              multiple
              disableCloseOnSelect
              size="small"
              disabled={!branchId}
              options={waiting}
              value={waiting.filter((option) => customerIds.includes(option.id))}
              onChange={(_, chosenCustomers) => {
                const ids = chosenCustomers.map((option) => option.id);
                setCustomerIds(ids);
                // Dropping a customer takes their invoices off the pass too; a hidden
                // invoice quietly riding along is exactly the mistake to avoid.
                setSelected((current) =>
                  current.filter((invoiceId) => {
                    const invoice = invoices.find((each) => each.salesInvoiceId === invoiceId);
                    return invoice ? ids.includes(invoice.customerId) : false;
                  }),
                );
              }}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={(props, option, { selected: isPicked }) => {
                const { key: optionKey, ...rest } = props;
                return (
                  <li key={optionKey} {...rest}>
                    <Checkbox size="small" checked={isPicked} sx={{ mr: 1 }} />
                    <Stack>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.invoiceCount} invoice{option.invoiceCount === 1 ? '' : 's'} ·{' '}
                        {option.pendingQtyBoxes} boxes waiting
                      </Typography>
                    </Stack>
                  </li>
                );
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key: tagKey, ...rest } = getTagProps({ index });
                  // The tag order is the route order, so number them.
                  return (
                    <Chip
                      key={tagKey}
                      {...rest}
                      size="small"
                      label={`${index + 1}. ${option.name}`}
                    />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Customers"
                  placeholder={customerIds.length === 0 ? 'Choose one or more' : ''}
                  helperText={
                    branchId
                      ? `${waiting.length} with goods waiting · pick them in drop order`
                      : 'Choose a branch first'
                  }
                />
              )}
              sx={{ minWidth: 360, flex: 1 }}
            />
          </Stack>

          {/* A lorry hired off the street is not in the master, so it can still be typed. */}
          {!vehicleId && (
            <>
              <Divider sx={{ my: 1.25 }}>
                <Typography variant="caption" color="text.secondary">
                  or a hired lorry that is not in the master
                </Typography>
              </Divider>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <TextField
                  label="Vehicle number"
                  size="small"
                  fullWidth={false}
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  placeholder="TN01AB1234"
                  sx={{ width: 170 }}
                />
                <TextField
                  label="Driver name"
                  size="small"
                  fullWidth={false}
                  disabled={driverId !== ''}
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  sx={{ width: 180 }}
                />
                <TextField
                  label="Driver phone"
                  size="small"
                  fullWidth={false}
                  disabled={driverId !== ''}
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  sx={{ width: 160 }}
                />
              </Stack>
            </>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
            <TextField
              label="Hire charge"
              size="small"
              type="number"
              fullWidth={false}
              value={hireCharge}
              onChange={(e) => setHireCharge(e.target.value)}
              helperText="What the trip costs us"
              sx={{ width: 150 }}
            />
            <TextField
              label="Advance paid"
              size="small"
              type="number"
              fullWidth={false}
              value={advancePaid}
              onChange={(e) => setAdvancePaid(e.target.value)}
              helperText="Handed to the driver"
              sx={{ width: 150 }}
            />
            <TextField
              label="Remarks"
              size="small"
              fullWidth={false}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              sx={{ width: 320 }}
            />
          </Stack>
        </Paper>

        {!branchId && <Alert severity="info">Choose a branch to see what is waiting to go.</Alert>}

        {branchId && waiting.length === 0 && !pending.isLoading && (
          <Alert severity="success">
            Nothing is waiting to be dispatched from {branchName ?? 'this branch'}.
          </Alert>
        )}

        {branchId && waiting.length > 0 && customerIds.length === 0 && (
          <Alert severity="info">
            Choose the customers this lorry is going to. Their pending invoices appear here, in
            drop order.
          </Alert>
        )}

        {byCustomer.map((group, groupIndex) => (
          <CustomerDrop
            key={group.customerId}
            index={groupIndex + 1}
            name={group.name}
            invoices={group.invoices}
            selected={selected}
            loads={loads}
            freight={freight}
            onToggleCustomer={toggleCustomer}
            onToggleInvoice={toggleInvoice}
            onSetLoad={setLoad}
            onSetFreight={(invoiceId, value) =>
              setFreight((current) => ({ ...current, [invoiceId]: value }))
            }
            loadedQty={loadedQty}
            dropFreight={dropFreight}
            dropNumberOf={(invoiceId) => selected.indexOf(invoiceId) + 1}
          />
        ))}

        {chosen.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={4} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Figure label="Customers" value={String(totals.customers)} />
              <Figure label="Invoices" value={String(chosen.length)} />
              <Figure label="Boxes loaded" value={String(totals.boxes)} />
              <Figure label="Freight charged" value={money(totals.charged)} />
              <Figure label="Driver collects" value={money(totals.toCollect)} />
              <Figure
                label="Freight margin"
                value={money(totals.charged - (Number(hireCharge) || 0))}
                bold
              />
            </Stack>
            {Number(hireCharge) > 0 && totals.charged < Number(hireCharge) && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                The customers are charged {money(totals.charged)} against a hire of{' '}
                {money(Number(hireCharge))}. The round runs at a loss unless that is
                deliberate.
              </Alert>
            )}
          </Paper>
        )}
      </Stack>
    </PageContainer>
  );
}

/**
 * One customer's drop: their invoices and what is going on the lorry for each.
 *
 * All of a customer's lines share one set of column headers however many invoices they
 * have — a header repeated per invoice is the thing that made this screen unreadable. The
 * invoice itself is a full-width band inside the same table, which keeps the columns lined
 * up down the whole card.
 */
function CustomerDrop({
  index,
  name,
  invoices,
  selected,
  loads,
  freight,
  onToggleCustomer,
  onToggleInvoice,
  onSetLoad,
  onSetFreight,
  loadedQty,
  dropFreight,
  dropNumberOf,
}: {
  index: number;
  name: string;
  invoices: PendingDispatchInvoice[];
  selected: string[];
  loads: Record<string, LoadEntry>;
  freight: Record<string, string>;
  onToggleCustomer: (invoices: PendingDispatchInvoice[], take: boolean) => void;
  onToggleInvoice: (invoice: PendingDispatchInvoice) => void;
  onSetLoad: (id: string, field: keyof LoadEntry, value: string) => void;
  onSetFreight: (invoiceId: string, value: string) => void;
  loadedQty: (invoice: PendingDispatchInvoice, line: PendingDispatchLine) => number;
  dropFreight: (invoice: PendingDispatchInvoice) => { charge: number; toCollect: number };
  dropNumberOf: (invoiceId: string) => number;
}): JSX.Element {
  const taken = invoices.filter((invoice) => selected.includes(invoice.salesInvoiceId));
  const takenAll = invoices.length > 0 && taken.length === invoices.length;
  const pendingBoxes =
    Math.round(invoices.reduce((sum, invoice) => sum + invoice.pendingQtyBoxes, 0) * 1000) / 1000;
  const toCollect =
    Math.round(taken.reduce((sum, invoice) => sum + dropFreight(invoice).toCollect, 0) * 100) / 100;

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1, py: 0.5, bgcolor: 'action.hover' }}
      >
        <Checkbox
          size="small"
          checked={takenAll}
          indeterminate={taken.length > 0 && !takenAll}
          onChange={() => onToggleCustomer(invoices, !takenAll)}
        />
        <Chip label={index} size="small" color="primary" />
        <Typography variant="subtitle2">{name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {invoices.length} invoice{invoices.length === 1 ? '' : 's'} · {pendingBoxes} boxes to go
        </Typography>
        <Box sx={{ flex: 1 }} />
        {toCollect > 0 && (
          <Chip label={`collect ${money(toCollect)}`} size="small" color="info" />
        )}
      </Stack>

      <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell align="right">To go</TableCell>
            <TableCell align="right" sx={{ width: 88 }}>
              Boxes
            </TableCell>
            <TableCell align="right" sx={{ width: 88 }}>
              Pcs
            </TableCell>
            <TableCell align="right" sx={{ width: 76 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((invoice) => {
            const isSelected = selected.includes(invoice.salesInvoiceId);
            const drop = dropFreight(invoice);
            return (
              <Fragment key={invoice.salesInvoiceId}>
                {/* The invoice band: everything about the document, on one line. */}
                <TableRow sx={{ '& td': { borderBottom: isSelected ? 0 : undefined } }}>
                  <TableCell colSpan={5} sx={{ py: 0.25 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Checkbox
                        size="small"
                        sx={{ p: 0.5 }}
                        checked={isSelected}
                        onChange={() => onToggleInvoice(invoice)}
                      />
                      <Typography variant="body2" fontWeight={600}>
                        {invoice.invoiceNumber}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')} ·{' '}
                        {money(invoice.grandTotal)} · {invoice.pendingQtyBoxes} boxes
                      </Typography>
                      {invoice.dispatchStatus === 'PARTIAL' && (
                        <Chip label="part sent" size="small" color="warning" variant="outlined" />
                      )}
                      {isSelected && (
                        <>
                          <Chip
                            label={`drop ${dropNumberOf(invoice.salesInvoiceId)}`}
                            size="small"
                            variant="outlined"
                          />
                          <Box sx={{ flex: 1 }} />
                          <TextField
                            label="Freight"
                            size="small"
                            type="number"
                            fullWidth={false}
                            value={freight[invoice.salesInvoiceId] ?? ''}
                            onChange={(e) => onSetFreight(invoice.salesInvoiceId, e.target.value)}
                            inputProps={{ min: 0, style: { textAlign: 'right' } }}
                            sx={{ width: 110 }}
                          />
                          <Tooltip
                            title={
                              invoice.freightCharge > 0
                                ? `Their invoice already billed ${money(invoice.freightCharge)}`
                                : 'Their invoice billed no freight'
                            }
                          >
                            <Typography
                              variant="caption"
                              color={drop.toCollect > 0 ? 'info.main' : 'text.secondary'}
                              sx={{ width: 92, textAlign: 'right' }}
                            >
                              {drop.toCollect > 0
                                ? `collect ${money(drop.toCollect)}`
                                : 'already billed'}
                            </Typography>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>

                {isSelected &&
                  invoice.lines.map((line) => {
                    const id = `${invoice.salesInvoiceId}:${line.salesInvoiceLineId}`;
                    const entry = loads[id];
                    const qty = loadedQty(invoice, line);
                    const over = qty > line.pendingQtyBoxes + 0.0005;
                    const short = qty < line.pendingQtyBoxes - 0.0005;
                    return (
                      <TableRow key={line.salesInvoiceLineId} hover>
                        <TableCell sx={{ pl: 4 }}>
                          <Typography variant="body2">{line.productName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[
                              line.productCode,
                              line.godownName,
                              [line.batchNo, line.shade].filter(Boolean).join(' / '),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatBoxPieces(
                            line.pendingQtyBoxes,
                            line.piecesPerBox,
                            line.baseUom === 'PIECE',
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            hiddenLabel
                            size="small"
                            type="number"
                            value={entry?.boxes ?? ''}
                            onChange={(e) => onSetLoad(id, 'boxes', e.target.value)}
                            inputProps={{ min: 0, style: { textAlign: 'right', padding: 6 } }}
                            sx={{ width: 76 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            hiddenLabel
                            size="small"
                            type="number"
                            disabled={line.baseUom === 'SQFT'}
                            value={entry?.pieces ?? ''}
                            onChange={(e) => onSetLoad(id, 'pieces', e.target.value)}
                            inputProps={{ min: 0, style: { textAlign: 'right', padding: 6 } }}
                            sx={{ width: 76 }}
                          />
                        </TableCell>
                        {/* A full load is the norm, so only the exceptions are marked. */}
                        <TableCell align="right">
                          {over ? (
                            <Chip label="over" size="small" color="error" />
                          ) : short ? (
                            <Chip label="short" size="small" color="warning" variant="outlined" />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}

function Figure({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={bold ? 'h6' : 'body1'} fontWeight={bold ? 700 : 500}>
        {value}
      </Typography>
    </Stack>
  );
}
