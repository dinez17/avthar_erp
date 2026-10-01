import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { calculatePurchaseLine, formatBoxPieces, sumPurchaseTotals } from '@tiles-erp/shared';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type {
  ProductItem,
  ProductPriceHint,
  ProductUom,
  QuotationLineInput,
} from '@tiles-erp/shared-types';
import { useAuth } from '../../auth/AuthProvider';
import { NO_AUTOFILL } from '../../components/noAutofill';
import { ApiError } from '../../lib/api-client';
import { lookupPincode } from '../../lib/pincode';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import {
  useCreateQuotation,
  useCustomerByPhone,
  useCustomers,
  usePriceHints,
  useQuotation,
  useQuotationStock,
  useSalesmen,
  useUpdateQuotation,
} from './api';

/** The product facts a quotation line needs, from either the catalogue or a price hint. */
interface LineProduct {
  id: string;
  sku: string;
  name: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: ProductUom;
  mrp: number | null;
  gstRate: number;
  sellingRate: number | null;
}

const fromProduct = (product: ProductItem): LineProduct => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  sizeMm: product.sizeMm,
  piecesPerBox: product.piecesPerBox,
  baseUom: product.baseUom,
  mrp: product.mrp,
  gstRate: product.gstRate,
  sellingRate: product.sellingRate,
});

const fromHint = (hint: ProductPriceHint): LineProduct => ({
  id: hint.productId,
  sku: hint.sku,
  name: hint.productName,
  sizeMm: hint.sizeMm,
  piecesPerBox: hint.piecesPerBox,
  baseUom: hint.baseUom,
  mrp: hint.mrp,
  gstRate: hint.gstRate,
  sellingRate: hint.sellingPrice === null ? null : round2(hint.sellingPrice * (1 + hint.gstRate / 100)),
});

/** The catalogue is searched on the server, so only a page of matches is fetched. */
const PRODUCT_PAGE_SIZE = 50;

interface DraftLine {
  code: string;
  productId: string;
  /** Set once the salesperson types a rate, so branch pricing stops overwriting it. */
  rateEdited: boolean;
  boxes: string;
  pieces: string;
  mrp: string;
  discountPct: string;
  rate: string;
  gstRate: string;
}

const blankLine: DraftLine = {
  code: '',
  productId: '',
  rateEdited: false,
  boxes: '',
  pieces: '',
  mrp: '',
  discountPct: '0',
  rate: '',
  gstRate: '',
};

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Counter quotations hold for ten days unless the salesperson says otherwise. */
const QUOTATION_VALID_DAYS = 10;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const defaultValidUntil = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + QUOTATION_VALID_DAYS);
  return isoDate(date);
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round8 = (value: number): number => Math.round(value * 100_000_000) / 100_000_000;
const includeGst = (rate: number, gstRate: number): number => round2(rate * (1 + gstRate / 100));

/**
 * Counter-style quotation entry: customer details on top, a code-driven line grid,
 * then freight and handling charges. Mirrors the paper quotation staff already use.
 */
export function QuotationEntryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const existing = useQuotation(id ?? null);
  const customers = useCustomers();
  const branches = useBranches();
  const { user } = useAuth();
  const canChangeBranch = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => canChangeBranch || user?.branchIds.includes(branch.id)),
    [branches.data, canChangeBranch, user?.branchIds],
  );
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerPincode, setCustomerPincode] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [pincodeMessage, setPincodeMessage] = useState('Enter PIN code first to fill city and state');
  const matchedCustomer = useCustomerByPhone(customerMobile);
  const [salesmanUserId, setSalesmanUserId] = useState('');
  const [branchId, setBranchId] = useState('');
  const salesmen = useSalesmen(branchId || undefined);
  const [quotationDate, setQuotationDate] = useState(() => isoDate(new Date()));
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [freight, setFreight] = useState('0');
  const [unloading, setUnloading] = useState('0');
  const [loading, setLoading] = useState('0');
  const [roundOff, setRoundOff] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit || !matchedCustomer.data) return;
    setCustomerId(matchedCustomer.data.id);
    setCustomerName(matchedCustomer.data.name);
    setCustomerPincode(matchedCustomer.data.pincode ?? '');
    setCustomerCity(matchedCustomer.data.city ?? '');
    setCustomerState(matchedCustomer.data.state ?? '');
  }, [isEdit, matchedCustomer.data]);

  useEffect(() => {
    if (!/^\d{6}$/.test(customerPincode)) return;
    const timer = window.setTimeout(() => {
      setPincodeMessage('Looking up PIN code…');
      void lookupPincode(customerPincode).then(({ city, state }) => {
        setCustomerCity(city);
        setCustomerState(state);
        setPincodeMessage('City and state filled automatically; you can edit them');
      }).catch((lookupError: unknown) => {
        setPincodeMessage(lookupError instanceof Error ? lookupError.message : 'Enter city and state manually');
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customerPincode]);

  // The item picker searches the server so the whole catalogue never has to be loaded.
  const [itemSearch, setItemSearch] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setItemQuery(itemSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  const products = useProducts(
    { page: 1, pageSize: PRODUCT_PAGE_SIZE, sortOrder: 'asc', search: itemQuery || undefined },
    {},
  );
  const productOptions = useMemo(
    () => (products.data?.items ?? []).map(fromProduct),
    [products.data],
  );

  // Products already on the quotation stay resolvable even once the search moves on.
  const [productById, setProductById] = useState<Map<string, LineProduct>>(new Map());
  const rememberProduct = (product: LineProduct): void =>
    setProductById((prev) => {
      const known = prev.get(product.id);
      if (known && known.sku === product.sku) return prev;
      return new Map(prev).set(product.id, product);
    });

  const hints = usePriceHints(
    branchId || undefined,
    lines.map((l) => l.productId),
  );

  // Free stock in the quoting branch, so a shortage is known at the counter rather than
  // discovered later when the order is confirmed.
  const stock = useQuotationStock(
    branchId || undefined,
    lines.map((l) => l.productId),
  );
  const freeByProduct = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of stock.data ?? []) {
      totals.set(entry.productId, (totals.get(entry.productId) ?? 0) + entry.availableQtyBoxes);
    }
    return totals;
  }, [stock.data]);
  const hintByProduct = useMemo(
    () => new Map((hints.data ?? []).map((h) => [h.productId, h])),
    [hints.data],
  );

  // Lines loaded from a saved draft are described by their price hints.
  useEffect(() => {
    const list = hints.data;
    if (!list || list.length === 0) return;
    setProductById((prev) => {
      const next = new Map(prev);
      let added = false;
      for (const hint of list) {
        if (!next.has(hint.productId)) {
          next.set(hint.productId, fromHint(hint));
          added = true;
        }
      }
      return added ? next : prev;
    });
  }, [hints.data]);

  /*
   * The branch's actual selling price is the default rate. Hints are fetched after a
   * product is chosen, so untouched lines are filled in once that answer arrives — and
   * refilled if the branch changes.
   */
  useEffect(() => {
    const list = hints.data;
    if (!list || list.length === 0) return;
    const priceByProduct = new Map(list.map((hint) => [hint.productId, hint.sellingPrice]));
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.productId || line.rateEdited) return line;
        const price = priceByProduct.get(line.productId);
        if (price === undefined || price === null) return line;
        const rate = String(includeGst(price, Number(line.gstRate || 0)));
        if (line.rate === rate) return line;
        changed = true;
        return { ...line, rate };
      });
      return changed ? next : prev;
    });
  }, [hints.data]);

  // Load an existing draft for editing.
  useEffect(() => {
    const quotation = existing.data;
    if (!quotation) return;
    setCustomerId(quotation.customerId ?? '');
    setCustomerName(quotation.customerName);
    setCustomerAddress(quotation.customerAddress ?? '');
    setCustomerMobile(quotation.customerMobile ?? '');
    setSalesmanUserId(quotation.salesmanUserId ?? '');
    setBranchId(quotation.branchId);
    setQuotationDate(quotation.quotationDate.slice(0, 10));
    setValidUntil(quotation.validUntil ? quotation.validUntil.slice(0, 10) : '');
    setFreight(String(quotation.freightCharge));
    setUnloading(String(quotation.unloadingCharge));
    setLoading(String(quotation.loadingCharge));
    setRoundOff(String(quotation.roundOff));
    setRemarks(quotation.remarks ?? '');
    setLines(
      (quotation.lines ?? []).map((line) => ({
        code: '',
        productId: line.productId,
        rateEdited: true,
        boxes: String(line.boxes),
        pieces: String(line.pieces),
        mrp: line.mrp === null ? '' : String(line.mrp),
        discountPct: String(line.discountPct),
        rate: String(includeGst(line.rate, line.gstRate)),
        gstRate: String(line.gstRate),
      })).concat(blankLine),
    );
  }, [existing.data]);

  // A logged-in salesperson always credits themselves; the picker is locked for them.
  const isSalesUser = useMemo(
    () => Boolean(!canChangeBranch && branchId && user && (salesmen.data ?? []).some((s) => s.id === user.id)),
    [branchId, canChangeBranch, salesmen.data, user],
  );

  useEffect(() => {
    if (isSalesUser && user && salesmanUserId !== user.id) {
      setSalesmanUserId(user.id);
    }
  }, [isSalesUser, user, salesmanUserId]);

  useEffect(() => {
    if (branchId && salesmen.isSuccess && salesmanUserId &&
        !salesmen.data.some((person) => person.id === salesmanUserId)) {
      setSalesmanUserId('');
    }
  }, [branchId, salesmen.isSuccess, salesmen.data, salesmanUserId]);

  // Existing quotations retain their saved branch; new quotations use assigned access.
  useEffect(() => {
    if (isEdit || branchId) return;
    if (availableBranches.length === 1 || (!canChangeBranch && availableBranches.length > 0)) {
      setBranchId(availableBranches[0]!.id);
    }
  }, [availableBranches, branchId, canChangeBranch, isEdit]);

  const setLine = (index: number, patch: Partial<DraftLine>): void =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  /** Applies a chosen product to a line, pulling size, MRP, GST and branch rate. */
  const applyProduct = (index: number, product: LineProduct | undefined): void => {
    if (!product) {
      setLine(index, { productId: '', code: '' });
      return;
    }
    rememberProduct(product);
    const hint = hintByProduct.get(product.id);
    const patch: Partial<DraftLine> = {
      productId: product.id,
      code: product.sku,
      mrp: product.mrp !== null ? String(product.mrp) : '',
      gstRate: String(product.gstRate),
      rate: String(hint?.sellingPrice === null || hint?.sellingPrice === undefined
        ? (product.sellingRate ?? '')
        : includeGst(hint.sellingPrice, product.gstRate)),
      rateEdited: false,
      // A piece-only product has no box quantity to enter.
      ...(product.baseUom === 'PIECE' ? { boxes: '' } : {}),
    };
    setLines((prev) => {
      const next = prev.map((line, i) => (i === index ? { ...line, ...patch } : line));
      // Filling the last row opens a fresh one so entry never stops to click "Add row".
      return index === prev.length - 1 ? [...next, blankLine] : next;
    });
  };

  // A code typed into the CODE column selects the product as soon as the search finds it.
  useEffect(() => {
    const items = products.data?.items;
    if (!items || items.length === 0) return;
    const bySku = new Map(items.map((product) => [product.sku.toUpperCase(), product]));
    lines.forEach((line, index) => {
      if (line.productId || !line.code.trim()) return;
      const match = bySku.get(line.code.trim().toUpperCase());
      if (match) applyProduct(index, fromProduct(match));
    });
  }, [products.data, lines]);

  const computed = lines.map((line) => {
    const product = productById.get(line.productId);
    const piecesPerBox = product?.piecesPerBox ?? 0;
    const pieceOnly = product?.baseUom === 'PIECE';
    const boxes = pieceOnly ? 0 : Number(line.boxes || 0);
    const pieces = Number(line.pieces || 0);
    const qtyBoxes = round3(boxes + (piecesPerBox > 0 ? pieces / piecesPerBox : 0));
    const inclusiveRate = Number(line.rate || 0);
    const discount = Number(line.discountPct || 0);
    const hint = hintByProduct.get(line.productId);
    const gst = Number(line.gstRate || hint?.gstRate || 0);
    const rate = gst > 0 ? inclusiveRate / (1 + gst / 100) : inclusiveRate;
    const amounts = calculatePurchaseLine(qtyBoxes, rate, discount, gst);
    const freeQtyBoxes = line.productId ? (freeByProduct.get(line.productId) ?? 0) : 0;
    const shortQtyBoxes = round3(Math.max(qtyBoxes - freeQtyBoxes, 0));
    const netRate = round2(rate * (1 - discount / 100));
    const belowMin =
      hint?.minSellingPrice !== null &&
      hint?.minSellingPrice !== undefined &&
      netRate > 0 &&
      netRate < hint.minSellingPrice;
    return {
      product,
      pieceOnly,
      qtyBoxes,
      ...amounts,
      belowMin,
      netRate,
      hint,
      freeQtyBoxes,
      shortQtyBoxes,
    };
  });

  // Quoting beyond stock is allowed; the salesperson just needs to know before promising.
  const shortages = computed.filter((entry) => entry.product && entry.shortQtyBoxes > 0);

  /*
   * Lines priced under the branch minimum, which stop the quotation being saved.
   *
   * Unlike a shortage, this is not advice. The server refuses these rates anyway unless
   * the user may override, so letting Save stay live only trades a red box now for a
   * rejected request and a lost form later — the answer is already known here.
   */
  const underMin = computed.filter((entry) => entry.belowMin);

  const totals = sumPurchaseTotals(computed);
  const charges =
    Number(freight || 0) + Number(unloading || 0) + Number(loading || 0) + Number(roundOff || 0);
  const grandTotal = round2(totals.grandTotal + charges);
  const totalItems = computed.filter((c) => c.qtyBoxes > 0).length;

  /*
   * Boxes and loose pieces are counted separately. Adding the decimal box figures would
   * be meaningless across products that hold a different number of pieces per box, and
   * a piece-only product contributes pieces alone.
   */
  const quantity = lines.reduce(
    (running, line, index) => {
      if (!line.productId) return running;
      const boxes = computed[index]!.pieceOnly ? 0 : Math.trunc(Number(line.boxes || 0));
      return {
        boxes: running.boxes + boxes,
        pieces: running.pieces + Math.trunc(Number(line.pieces || 0)),
      };
    },
    { boxes: 0, pieces: 0 },
  );
  const quantityLabel =
    [quantity.boxes ? `${quantity.boxes} box` : '', quantity.pieces ? `${quantity.pieces} pcs` : '']
      .filter(Boolean)
      .join(' ') || '0';

  const save = async (): Promise<void> => {
    setError(null);
    if (!branchId) {
      setError('Choose a branch');
      return;
    }
    if (!customerId && !customerName.trim()) {
      setError('Enter a customer name');
      return;
    }
    if (!isEdit && customerMobile.replace(/\D/g, '').length < 10) {
      setError('Enter a 10-digit customer mobile number');
      return;
    }
    if (!isEdit && (!/^\d{6}$/.test(customerPincode) || !customerCity.trim() || !customerState.trim())) {
      setError('PIN code, city and state are required');
      return;
    }

    const payload: QuotationLineInput[] = [];
    for (const [index, line] of lines.entries()) {
      if (!line.productId) continue;
      const entry = computed[index]!;
      if (entry.qtyBoxes <= 0) {
        setError('Every line needs a box or piece quantity');
        return;
      }
      payload.push({
        productId: line.productId,
        boxes: entry.pieceOnly ? 0 : Number(line.boxes || 0),
        pieces: Number(line.pieces || 0),
        mrp: line.mrp ? Number(line.mrp) : undefined,
        rate: round8(Number(line.rate || 0) / (1 + Number(line.gstRate || entry.hint?.gstRate || 0) / 100)),
        discountPct: Number(line.discountPct || 0),
        ...(line.gstRate ? { gstRate: Number(line.gstRate) } : {}),
      });
    }
    if (payload.length === 0) {
      setError('Add at least one item');
      return;
    }

    const body = {
      customerId: customerId || null,
      customerName: customerName.trim() || undefined,
      customerAddress: [customerAddress.trim(), customerCity.trim(), customerState.trim(), customerPincode]
        .filter(Boolean).join(', ') || undefined,
      customerMobile: customerMobile.trim() || undefined,
      salesmanUserId: salesmanUserId || undefined,
      branchId,
      quotationDate: new Date(quotationDate).toISOString(),
      validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      freightCharge: Number(freight || 0),
      unloadingCharge: Number(unloading || 0),
      loadingCharge: Number(loading || 0),
      roundOff: Number(roundOff || 0),
      remarks: remarks || undefined,
      lines: payload,
    };

    try {
      if (isEdit && existing.data) {
        await updateQuotation.mutateAsync({
          id: existing.data.id,
          ...body,
          version: existing.data.version,
        });
      } else {
        await createQuotation.mutateAsync(body);
      }
      navigate('/quotations');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the quotation');
    }
  };

  const pending = createQuotation.isPending || updateQuotation.isPending;
  const cell = { py: 0.375, px: 0.5, borderBottom: '1px solid', borderColor: 'divider' };
  const headCell = {
    ...cell,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    py: 0.75,
    color: 'text.secondary',
    bgcolor: 'action.hover',
  };
  // Keep desktop rows compact while giving phone users large, reliable touch targets.
  const field = {
    '& .MuiInputBase-root': {
      fontSize: { xs: 16, sm: 13 },
      minHeight: { xs: 48, sm: 'auto' },
    },
    '& .MuiInputBase-input': { py: { xs: 1.25, sm: 0.75 }, px: 1.25 },
    '& .MuiInputLabel-root': { fontSize: { xs: 15, sm: 13 } },
    '& .MuiFormHelperText-root': { mx: 0.5, fontSize: 12 },
  };
  // Money and quantity columns read as a column of figures, so they align right.
  const numberField = { ...field, '& input': { textAlign: 'right' } };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void save());

  return (
    <PageContainer
      title={isEdit ? `Edit ${existing.data?.quotationNumber ?? 'quotation'}` : 'Quotation'}
      subtitle="Counter quotation: enter the customer, add items by code, then charges."
      actions={
        <Stack
          direction="row"
          spacing={1}
          sx={{ display: { xs: 'none', sm: 'flex' }, width: 'auto' }}
        >
          <Button variant="outlined" color="inherit" sx={{ flex: { xs: 1, sm: 'initial' } }} onClick={() => navigate('/quotations')}>
            Cancel
          </Button>
          <Tooltip
            title={
              underMin.length > 0
                ? 'One or more rates are below the branch minimum selling price'
                : ''
            }
          >
            <Box component="span" sx={{ flex: { xs: 1, sm: 'initial' } }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                fullWidth
                onClick={() => void save()}
                disabled={pending || underMin.length > 0}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          </Tooltip>
        </Stack>
      }
    >
      <Stack spacing={{ xs: 1.25, sm: 1 }} sx={{ pb: { xs: 10, sm: 0 } }}>
        {error && (
          <Alert severity="error" sx={{ py: 0 }}>
            {error}
          </Alert>
        )}

        {underMin.length > 0 && (
          <Alert severity="error" sx={{ py: 0 }}>
            Cannot save — priced below the branch minimum:{' '}
            {underMin
              .map(
                (entry) =>
                  `${entry.product?.sku ?? 'a line'} at ${includeGst(entry.netRate, Number(entry.hint?.gstRate || 0)).toLocaleString('en-IN')} against a minimum of ${includeGst(entry.hint?.minSellingPrice ?? 0, Number(entry.hint?.gstRate || 0)).toLocaleString('en-IN')} incl GST`,
              )
              .join('; ')}
            . Raise the rate, or reduce the discount.
          </Alert>
        )}

        {shortages.length > 0 && (
          <Alert severity="warning" sx={{ py: 0 }}>
            Not enough free stock at {branches.data?.find((b) => b.id === branchId)?.name ?? 'this branch'}:{' '}
            {shortages
              .map(
                (entry) =>
                  `${entry.product?.name} short by ${formatBoxPieces(
                    entry.shortQtyBoxes,
                    entry.product?.piecesPerBox ?? 1,
                    entry.product?.baseUom === 'PIECE',
                  )}`,
              )
              .join('; ')}
            . You can still quote it, but the order cannot be confirmed until stock arrives.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 1.5 }, borderRadius: { xs: 2, sm: 1 } }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ display: { xs: 'block', sm: 'none' }, mb: 1.25 }}
          >
            Customer details
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: { xs: 1.25, sm: 1 },
              alignItems: 'start',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              },
            }}
          >
            <Autocomplete
              sx={{ gridColumn: { xs: '1 / -1', sm: 'span 2' } }}
              freeSolo
              size="small"
              options={customers.data ?? []}
              getOptionLabel={(option) =>
                typeof option === 'string' ? option : `${option.name} · ${option.phone ?? ''}`
              }
              inputValue={customerName}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') {
                  setCustomerName(value);
                  setCustomerId('');
                }
              }}
              onChange={(_, value) => {
                if (value && typeof value !== 'string') {
                  setCustomerId(value.id);
                  setCustomerName(value.name);
                  setCustomerMobile(value.phone ?? '');
                  setCustomerPincode(value.pincode ?? '');
                  setCustomerCity(value.city ?? '');
                  setCustomerState(value.state ?? '');
                  setCustomerAddress(
                    [value.addressLine1, value.addressLine2]
                      .filter(Boolean)
                      .join(', '),
                  );
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Customer name *"
                  placeholder="Existing customer or walk-in name"
                  sx={field}
                  inputProps={{ ...params.inputProps, ...NO_AUTOFILL }}
                />
              )}
            />
            <TextField
              label="Quotation date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={field}
              value={quotationDate}
              onChange={(e) => setQuotationDate(e.target.value)}
            />
            <TextField
              label="Valid until"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={field}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />

            <TextField
              label="Customer mobile *"
              size="small"
              value={customerMobile}
              onChange={(e) => {
                setCustomerMobile(e.target.value);
                setCustomerId('');
              }}
              required={!isEdit}
              fullWidth
              sx={{ ...field, gridColumn: { xs: '1 / -1', sm: 'span 2' } }}
              inputProps={{ ...NO_AUTOFILL, inputMode: 'tel' }}
            />
            <TextField
              select
              label="Branch *"
              size="small"
              sx={field}
              value={branchId}
              disabled={!canChangeBranch && availableBranches.length === 0}
              helperText={!canChangeBranch && !availableBranches.length ? 'No branch assigned. Contact your administrator.' : undefined}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {availableBranches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sales man"
              size="small"
              sx={field}
              value={salesmanUserId}
              onChange={(e) => setSalesmanUserId(e.target.value)}
              disabled={isSalesUser || !branchId || salesmen.isFetching}
              title={isSalesUser ? 'Quotations are credited to you' : undefined}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {(branchId ? salesmen.data ?? [] : []).map((person) => (
                <MenuItem key={person.id} value={person.id}>
                  {person.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="PIN code *"
              size="small"
              value={customerPincode}
              onChange={(e) => setCustomerPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              helperText={pincodeMessage}
              required={!isEdit}
              sx={field}
              inputProps={{ ...NO_AUTOFILL, inputMode: 'numeric', maxLength: 6 }}
            />
            <TextField
              label="City *"
              size="small"
              value={customerCity}
              onChange={(e) => setCustomerCity(e.target.value)}
              required={!isEdit}
              sx={field}
              inputProps={NO_AUTOFILL}
            />
            <TextField
              label="State *"
              size="small"
              value={customerState}
              onChange={(e) => setCustomerState(e.target.value)}
              required={!isEdit}
              sx={{ ...field, gridColumn: { xs: '1 / -1', sm: 'span 2' } }}
              inputProps={NO_AUTOFILL}
            />

            <TextField
              label="Customer address"
              size="small"
              multiline
              minRows={2}
              maxRows={3}
              sx={{ ...field, gridColumn: '1 / -1' }}
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              inputProps={NO_AUTOFILL}
            />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: { xs: 2, sm: 1 } }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ display: { xs: 'block', md: 'none' }, px: 1.5, pt: 1.5 }}
          >
            Items
          </Typography>
          <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' }, p: 1.25 }}>
            {lines.map((line, index) => {
              const entry = computed[index]!;
              const product = entry.product;
              return (
                <Paper key={index} variant="outlined" sx={{ p: 1.25, bgcolor: 'background.paper', borderRadius: 2 }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="subtitle1" fontWeight={700}>
                        Item {index + 1}
                      </Typography>
                      <IconButton
                        size="small" color="error"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        disabled={lines.length === 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr)',
                        gap: 1.25,
                      }}
                    >
                      <TextField
                        size="small"
                        label="SKU / code"
                        fullWidth
                        sx={field}
                        value={line.code || product?.sku || ''}
                        onChange={(event) => {
                          setLine(index, { code: event.target.value, productId: '' });
                          setItemSearch(event.target.value);
                        }}
                        inputProps={NO_AUTOFILL}
                      />
                      <Autocomplete
                        size="small"
                        fullWidth
                        options={productOptions}
                        filterOptions={(option) => option}
                        loading={products.isFetching}
                        noOptionsText={products.isFetching ? 'Searching…' : 'No item matches that search'}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={product ?? null}
                        onChange={(_, value) => applyProduct(index, value ?? undefined)}
                        onInputChange={(_, value, reason) => {
                          if (reason === 'input') setItemSearch(value);
                        }}
                        sx={{ ...field, minWidth: 0, '& .MuiAutocomplete-inputRoot': { py: '2px !important' } }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Item"
                            placeholder="Search and select item"
                            inputProps={{ ...params.inputProps, ...NO_AUTOFILL }}
                          />
                        )}
                      />
                    </Box>

                    {product && (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: 0.25,
                          px: 0.25,
                        }}
                      >
                        <Typography variant="caption">Size: {product.sizeMm || '—'}</Typography>
                        <Typography variant="caption">PCS/box: {product.piecesPerBox}</Typography>
                        <Typography
                          variant="caption"
                          color={entry.shortQtyBoxes > 0 ? 'error.main' : 'text.secondary'}
                          fontWeight={entry.shortQtyBoxes > 0 ? 700 : 400}
                        >
                          Free: {formatBoxPieces(entry.freeQtyBoxes, product.piecesPerBox, product.baseUom === 'PIECE')}
                        </Typography>
                        <Typography variant="caption">MRP: {line.mrp ? money(Number(line.mrp)) : '—'}</Typography>
                      </Box>
                    )}

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 1.25,
                      }}
                    >
                      <TextField
                        label="Boxes" size="small" type="number" sx={numberField}
                        value={entry.pieceOnly ? '' : line.boxes} disabled={entry.pieceOnly}
                        onChange={(event) => setLine(index, { boxes: event.target.value })}
                        onBlur={() => { if (!line.boxes.trim()) setLine(index, { boxes: '0' }); }}
                        inputProps={{ min: 0, inputMode: 'decimal' }}
                      />
                      <TextField
                        label="Pieces" size="small" type="number" sx={numberField}
                        value={line.pieces}
                        onChange={(event) => setLine(index, { pieces: event.target.value })}
                        onBlur={() => { if (!line.pieces.trim()) setLine(index, { pieces: '0' }); }}
                        inputProps={{ min: 0, inputMode: 'decimal' }}
                      />
                      <TextField
                        label="Rate incl GST" size="small" type="number" sx={numberField}
                        error={entry.belowMin}
                        value={line.rate}
                        onChange={(event) => setLine(index, { rate: event.target.value, rateEdited: true })}
                        inputProps={{ min: 0, inputMode: 'decimal' }}
                      />
                      <TextField
                        label="Discount %" size="small" type="number" sx={numberField}
                        error={entry.belowMin}
                        value={line.discountPct}
                        onChange={(event) => setLine(index, { discountPct: event.target.value })}
                        inputProps={{ min: 0, max: 100, inputMode: 'decimal' }}
                      />
                    </Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Line total</Typography>
                      <Typography variant="h6" fontWeight={700}>{money(entry.lineTotal)}</Typography>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{ minWidth: 1120, tableLayout: 'fixed', '& td, & th': { whiteSpace: 'nowrap' } }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...headCell, width: 130 }}>CODE</TableCell>
                <TableCell sx={headCell}>ITEM NAME</TableCell>
                <TableCell sx={{ ...headCell, width: 92 }}>SIZE</TableCell>
                <TableCell sx={{ ...headCell, width: 72 }} align="right">PCS/BOX</TableCell>
                <TableCell sx={{ ...headCell, width: 100 }} align="right">FREE STOCK</TableCell>
                <TableCell sx={{ ...headCell, width: 88 }} align="right">MRP</TableCell>
                <TableCell sx={{ ...headCell, width: 74 }} align="right">BOX</TableCell>
                <TableCell sx={{ ...headCell, width: 74 }} align="right">PCS</TableCell>
                <TableCell sx={{ ...headCell, width: 110 }} align="right">RATE INCL GST</TableCell>
                <TableCell sx={{ ...headCell, width: 74 }} align="right">DISC %</TableCell>
                <TableCell sx={{ ...headCell, width: 115 }} align="right">
                  TOTAL
                </TableCell>
                <TableCell sx={{ ...headCell, width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, index) => {
                const entry = computed[index]!;
                const product = entry.product;
                return (
                  <TableRow key={index} hover>
                    <TableCell sx={cell}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="SKU"
                        sx={field}
                        value={line.code || product?.sku || ''}
                        onChange={(e) => {
                          setLine(index, { code: e.target.value, productId: '' });
                          setItemSearch(e.target.value);
                        }}
                        inputProps={NO_AUTOFILL}
                      />
                    </TableCell>
                    <TableCell sx={cell}>
                      <Autocomplete
                        size="small"
                        options={productOptions}
                        filterOptions={(option) => option}
                        loading={products.isFetching}
                        noOptionsText={
                          products.isFetching ? 'Searching…' : 'No item matches that search'
                        }
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={product ?? null}
                        onChange={(_, value) => applyProduct(index, value ?? undefined)}
                        onInputChange={(_, value, reason) => {
                          if (reason === 'input') setItemSearch(value);
                        }}
                        sx={{ ...field, '& .MuiAutocomplete-inputRoot': { py: '2px !important' } }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Item"
                            inputProps={{ ...params.inputProps, ...NO_AUTOFILL }}
                          />
                        )}
                      />
                    </TableCell>
                    <TableCell sx={cell}>
                      <Typography variant="caption">{product?.sizeMm ?? ''}</Typography>
                    </TableCell>
                    <TableCell sx={cell} align="right">
                      <Typography variant="caption">{product?.piecesPerBox ?? ''}</Typography>
                    </TableCell>
                    <TableCell sx={cell} align="right">
                      {product && (
                        <Typography
                          variant="caption"
                          color={entry.shortQtyBoxes > 0 ? 'error.main' : 'text.secondary'}
                          fontWeight={entry.shortQtyBoxes > 0 ? 700 : 400}
                        >
                          {formatBoxPieces(
                            entry.freeQtyBoxes,
                            product.piecesPerBox,
                            product.baseUom === 'PIECE',
                          )}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={cell}>
                      <Typography variant="caption">
                        {line.mrp ? money(Number(line.mrp)) : ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cell}>
                      <TextField
                        size="small"
                        fullWidth
                        type="number"
                        sx={numberField}
                        value={entry.pieceOnly ? '' : line.boxes}
                        disabled={entry.pieceOnly}
                        onChange={(e) => setLine(index, { boxes: e.target.value })}
                        onBlur={() => { if (!line.boxes.trim()) setLine(index, { boxes: '0' }); }}
                      />
                    </TableCell>
                    <TableCell sx={cell}>
                      <TextField
                        size="small"
                        fullWidth
                        type="number"
                        sx={numberField}
                        value={line.pieces}
                        onChange={(e) => setLine(index, { pieces: e.target.value })}
                        onBlur={() => { if (!line.pieces.trim()) setLine(index, { pieces: '0' }); }}
                      />
                    </TableCell>
                    <TableCell sx={cell}>
                      <TextField
                        size="small"
                        fullWidth
                        type="number"
                        sx={numberField}
                        error={entry.belowMin}
                        title={entry.belowMin ? `Minimum ${includeGst(entry.hint?.minSellingPrice ?? 0, Number(line.gstRate || entry.hint?.gstRate || 0))} incl GST` : undefined}
                        value={line.rate}
                        onChange={(e) => setLine(index, { rate: e.target.value, rateEdited: true })}
                      />
                    </TableCell>
                    <TableCell sx={cell}>
                      <TextField
                        size="small"
                        fullWidth
                        type="number"
                        sx={numberField}
                        error={entry.belowMin}
                        value={line.discountPct}
                        onChange={(e) => setLine(index, { discountPct: e.target.value })}
                      />
                    </TableCell>
                    <TableCell sx={cell} align="right">
                      <Typography variant="caption" fontWeight={700}>
                        {money(entry.lineTotal)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cell}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        disabled={lines.length === 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Box>
          <Box sx={{ px: { xs: 1.25, md: 1 }, pb: { xs: 1.25, md: 0.5 }, pt: 0 }}>
            <Button
              size="small"
              variant="outlined"
              sx={{ width: { xs: '100%', md: 'auto' }, minHeight: { xs: 46, md: 'auto' }, fontSize: { xs: 15, md: 'inherit' } }}
              startIcon={<AddIcon />}
              onClick={() => setLines((prev) => [...prev, blankLine])}
            >
              Add row
            </Button>
          </Box>
        </Paper>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.25, md: 1 }} alignItems="flex-start">
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1 }, flex: 1, width: '100%', borderRadius: { xs: 2, sm: 1 } }}>
            <TextField
              label="Remarks"
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={3}
              sx={field}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 1 }, width: { xs: '100%', md: 330 }, borderRadius: { xs: 2, sm: 1 } }}>
            <Typography
              variant="subtitle1"
              fontWeight={700}
              sx={{ display: { xs: 'block', md: 'none' }, mb: 1.25 }}
            >
              Charges and total
            </Typography>
            <Stack spacing={{ xs: 1, sm: 0.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption">Auto freight</Typography>
                <TextField
                  size="small"
                  type="number"
                  fullWidth={false}
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                  sx={{ ...numberField, width: { xs: 150, sm: 120 } }}
                />
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption">Unloading</Typography>
                <TextField
                  size="small"
                  type="number"
                  fullWidth={false}
                  value={unloading}
                  onChange={(e) => setUnloading(e.target.value)}
                  sx={{ ...numberField, width: { xs: 150, sm: 120 } }}
                />
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption">Loading charges</Typography>
                <TextField
                  size="small"
                  type="number"
                  fullWidth={false}
                  value={loading}
                  onChange={(e) => setLoading(e.target.value)}
                  sx={{ ...numberField, width: { xs: 150, sm: 120 } }}
                />
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption">Add/Less round off</Typography>
                <TextField
                  size="small"
                  type="number"
                  fullWidth={false}
                  value={roundOff}
                  onChange={(e) => setRoundOff(e.target.value)}
                  sx={{ ...numberField, width: { xs: 150, sm: 120 } }}
                />
              </Stack>

              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">Total items</Typography>
                <Typography variant="caption">
                  {totalItems} ({quantityLabel})
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">Sub total</Typography>
                <Typography variant="caption">{money(totals.subTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">GST</Typography>
                <Typography variant="caption">{money(totals.gstAmount)}</Typography>
              </Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography variant="subtitle2">Total amount</Typography>
                <Typography variant="h6" fontWeight={700}>
                  {money(grandTotal)}
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        </Stack>

        <Paper
          elevation={8}
          sx={{
            display: { xs: 'block', sm: 'none' },
            position: 'fixed',
            zIndex: (theme) => theme.zIndex.appBar,
            left: 0,
            right: 0,
            bottom: 0,
            px: 1,
            pt: 1,
            pb: 'max(8px, env(safe-area-inset-bottom))',
            borderRadius: 0,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="inherit"
              sx={{ flex: 1, minHeight: 48, fontSize: 15 }}
              onClick={() => navigate('/quotations')}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              sx={{ flex: 1, minHeight: 48, fontSize: 15 }}
              onClick={() => void save()}
              disabled={pending || underMin.length > 0}
            >
              {pending ? 'Saving…' : 'Save quotation'}
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </PageContainer>
  );
}
