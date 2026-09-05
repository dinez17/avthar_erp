import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, Stack } from '@mui/material';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { amountInWords, formatBoxPieces, needsEwayBill } from '@tiles-erp/shared';
import type { PrintPartyBlock } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useTransferPrint } from './transfers-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

const PAGE_STYLE = '@page { size: A4 portrait; margin: 12mm 10mm; }';

/**
 * Printing hides the app and shows only the sheet.
 *
 * `visibility` rather than `display`, because collapsing the layout reflows the sheet
 * out of position; hiding it in place leaves the sheet exactly where it was measured.
 */
const PRINT_ISOLATION = `
  @media print {
    body * { visibility: hidden !important; }
    .tf-sheet, .tf-sheet * { visibility: visible !important; }
    .print-hidden, .print-hidden * { display: none !important; }
    .tf-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; }
    body { background: #fff; }
  }
`;

/**
 * The paper that travels with a stock transfer.
 *
 * Which document this is was decided when the transfer was dispatched, not here: a
 * delivery challan when both godowns sit under one GSTIN, a tax invoice when they do
 * not. The layout is the same either way — what changes is the heading, the tax block
 * and the declaration at the foot, because those are the parts that make a claim.
 */
export function TransferPrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useTransferPrint(id ?? null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PAGE_STYLE;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  if (isLoading) return <LoadingOverlay open />;
  if (isError || !data) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">That transfer could not be loaded.</Alert>
      </Box>
    );
  }

  const { transfer, company, fromBranch, toBranch } = data;
  const isTaxInvoice = transfer.documentType === 'TAX_INVOICE';
  const title = isTaxInvoice ? 'TAX INVOICE' : 'DELIVERY CHALLAN';
  const ewayNeeded = needsEwayBill(transfer.grandTotal);

  return (
    <Box>
      <style>{PRINT_ISOLATION}</style>
      <Stack
        className="print-hidden"
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Button
          color="inherit"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/stock/transfers')}
        >
          Back
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print
        </Button>
      </Stack>

      <Box
        className="tf-sheet"
        sx={{
          width: '190mm',
          mx: 'auto',
          my: 2,
          p: 2,
          fontSize: 12,
          color: '#000',
          bgcolor: '#fff',
          border: '1px solid #000',
          '@media print': { m: 0, border: 'none', width: 'auto' },
        }}
      >
        <Box sx={{ textAlign: 'center', borderBottom: '1px solid #000', pb: 1 }}>
          <Box sx={{ fontSize: 18, fontWeight: 700 }}>
            {company.legalName || company.name || fromBranch.name}
          </Box>
          {fromBranch.addressLines.map((line) => (
            <Box key={line}>{line}</Box>
          ))}
          <Box>
            {[fromBranch.phone && `Ph ${fromBranch.phone}`, fromBranch.email]
              .filter(Boolean)
              .join(' · ')}
          </Box>
          <Box sx={{ mt: 0.5, fontWeight: 700, letterSpacing: 1 }}>{title}</Box>
          {!isTaxInvoice && (
            <Box sx={{ fontSize: 10 }}>
              Issued under Rule 55 — transfer of goods, not a supply
            </Box>
          )}
        </Box>

        <Stack direction="row" sx={{ borderBottom: '1px solid #000' }}>
          <Field label="Document no" value={transfer.documentNo} grow />
          <Field label="Date" value={date(transfer.transferDate)} grow />
          <Field label="Transfer ref" value={transfer.transferNo} grow last />
        </Stack>

        <Stack direction="row" sx={{ borderBottom: '1px solid #000' }}>
          <Party label="Consignor (from)" party={fromBranch} godown={transfer.fromGodownName} />
          <Party label="Consignee (to)" party={toBranch} godown={transfer.toGodownName} last />
        </Stack>

        <Stack direction="row" sx={{ borderBottom: '1px solid #000', flexWrap: 'wrap' }}>
          <Field label="Transporter" value={transfer.transporterName ?? 'Own vehicle'} grow />
          <Field label="Vehicle" value={transfer.vehicleNumber ?? '—'} grow />
          <Field label="Driver" value={transfer.driverName ?? '—'} grow />
          <Field label="LR no" value={transfer.lrNumber ?? '—'} grow last />
        </Stack>

        <Stack direction="row" sx={{ borderBottom: '1px solid #000' }}>
          <Field
            label="Distance"
            value={transfer.distanceKm !== null ? `${transfer.distanceKm} km` : '—'}
            grow
          />
          <Field
            label="E-way bill no"
            value={transfer.ewayBillNo ?? (ewayNeeded ? 'REQUIRED — not generated' : '—')}
            grow
          />
          <Field
            label="E-way bill date"
            value={transfer.ewayBillDate ? date(transfer.ewayBillDate) : '—'}
            grow
            last
          />
        </Stack>

        <Box component="table" sx={tableSx}>
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={{ width: 28 }}>
                #
              </Box>
              <Box component="th" sx={{ textAlign: 'left' }}>
                Description
              </Box>
              <Box component="th" sx={{ width: 70 }}>
                HSN
              </Box>
              <Box component="th" sx={{ width: 90 }}>
                Quantity
              </Box>
              <Box component="th" sx={{ width: 70 }}>
                Rate
              </Box>
              {isTaxInvoice && (
                <Box component="th" sx={{ width: 50 }}>
                  GST%
                </Box>
              )}
              <Box component="th" sx={{ width: 85 }}>
                Value
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {(transfer.lines ?? []).map((line, index) => (
              <Box component="tr" key={`${line.productId}-${line.batchNo}-${line.shade}`}>
                <Box component="td" sx={{ textAlign: 'center' }}>
                  {index + 1}
                </Box>
                <Box component="td">
                  {line.productName}
                  <Box sx={{ fontSize: 10, color: '#444' }}>
                    {[line.sku, line.batchNo, line.shade].filter(Boolean).join(' · ')}
                  </Box>
                </Box>
                <Box component="td" sx={{ textAlign: 'center' }}>
                  {line.hsnCode}
                </Box>
                <Box component="td" sx={{ textAlign: 'right' }}>
                  {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                </Box>
                <Box component="td" sx={{ textAlign: 'right' }}>
                  {money(line.rate)}
                </Box>
                {isTaxInvoice && (
                  <Box component="td" sx={{ textAlign: 'center' }}>
                    {line.gstRate}
                  </Box>
                )}
                <Box component="td" sx={{ textAlign: 'right' }}>
                  {money(line.lineSubTotal)}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Stack direction="row" sx={{ borderBottom: '1px solid #000' }}>
          <Box sx={{ flex: 1, p: 0.75, borderRight: '1px solid #000' }}>
            <Box sx={{ fontSize: 10, color: '#444' }}>Amount in words</Box>
            <Box sx={{ fontWeight: 700 }}>{amountInWords(transfer.grandTotal)}</Box>
            {!isTaxInvoice && (
              <Box sx={{ fontSize: 10, mt: 0.5 }}>
                Value stated for transport purposes only. This is not a supply and no tax is
                charged.
              </Box>
            )}
          </Box>
          <Box sx={{ width: 220, p: 0.75 }}>
            <Total label="Taxable value" value={transfer.subTotal} />
            {isTaxInvoice && transfer.interState && (
              <Total label="IGST" value={transfer.igstAmount} />
            )}
            {isTaxInvoice && !transfer.interState && (
              <>
                <Total label="CGST" value={transfer.cgstAmount} />
                <Total label="SGST" value={transfer.sgstAmount} />
              </>
            )}
            <Total label="Total" value={transfer.grandTotal} bold />
          </Box>
        </Stack>

        <Stack direction="row" sx={{ minHeight: 90 }}>
          <Box sx={{ flex: 1, p: 0.75, borderRight: '1px solid #000' }}>
            <Box sx={{ fontSize: 10, color: '#444' }}>Received the goods in good condition</Box>
            {transfer.receivedAt ? (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ fontWeight: 700 }}>{transfer.receivedByName}</Box>
                <Box sx={{ fontSize: 10 }}>{date(transfer.receivedAt)}</Box>
                {transfer.totalShort > 0 && (
                  <Box sx={{ fontSize: 10, fontWeight: 700 }}>
                    Short by {transfer.totalShort} box
                    {transfer.totalShort === 1 ? '' : 'es'}
                  </Box>
                )}
                {transfer.receiptRemarks && (
                  <Box sx={{ fontSize: 10 }}>{transfer.receiptRemarks}</Box>
                )}
              </Box>
            ) : (
              <Box sx={{ mt: 5, fontSize: 10 }}>
                Name, signature and date — consignee&rsquo;s godown
              </Box>
            )}
          </Box>
          <Box sx={{ width: 220, p: 0.75, textAlign: 'center' }}>
            <Box sx={{ fontSize: 10, color: '#444' }}>
              For {company.legalName || company.name}
            </Box>
            <Box sx={{ mt: 5, fontSize: 10 }}>Authorised signatory</Box>
          </Box>
        </Stack>

        {transfer.remarks && (
          <Box sx={{ borderTop: '1px solid #000', p: 0.75, fontSize: 10 }}>
            Remarks: {transfer.remarks}
          </Box>
        )}
      </Box>
    </Box>
  );
}

const tableSx = {
  width: '100%',
  borderCollapse: 'collapse',
  '& th, & td': {
    border: '1px solid #000',
    borderTop: 'none',
    borderLeft: 'none',
    p: 0.5,
    verticalAlign: 'top',
  },
  '& th:first-of-type, & td:first-of-type': { borderLeft: '1px solid #000' },
  '& th': { background: '#eee', fontSize: 11 },
  '& tr:last-of-type td': { borderBottom: 'none' },
} as const;

function Field({
  label,
  value,
  grow = false,
  last = false,
}: {
  label: string;
  value: string;
  grow?: boolean;
  last?: boolean;
}): JSX.Element {
  return (
    <Box
      sx={{
        flex: grow ? 1 : 'none',
        p: 0.75,
        borderRight: last ? 'none' : '1px solid #000',
      }}
    >
      <Box sx={{ fontSize: 10, color: '#444' }}>{label}</Box>
      <Box sx={{ fontWeight: 700 }}>{value}</Box>
    </Box>
  );
}

function Party({
  label,
  party,
  godown,
  last = false,
}: {
  label: string;
  party: PrintPartyBlock;
  godown: string;
  last?: boolean;
}): JSX.Element {
  return (
    <Box sx={{ flex: 1, p: 0.75, borderRight: last ? 'none' : '1px solid #000' }}>
      <Box sx={{ fontSize: 10, color: '#444' }}>{label}</Box>
      <Box sx={{ fontWeight: 700 }}>{party.name}</Box>
      <Box sx={{ fontSize: 11 }}>Godown: {godown}</Box>
      {party.addressLines.map((line) => (
        <Box key={line} sx={{ fontSize: 11 }}>
          {line}
        </Box>
      ))}
      <Box sx={{ fontSize: 11 }}>GSTIN: {party.gstin ?? '—'}</Box>
    </Box>
  );
}

function Total({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}): JSX.Element {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      sx={{ fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #000' : 'none', pt: bold ? 0.25 : 0 }}
    >
      <Box>{label}</Box>
      <Box>{money(value)}</Box>
    </Stack>
  );
}
