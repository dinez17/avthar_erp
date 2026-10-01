import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { amountInWords, formatBoxPieces } from '@tiles-erp/shared';
import type { SalesInvoiceLineItem, SalesInvoicePrintData } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useClaimDeliverySlipPrint, useDeliverySlipPreview, useSalesInvoicePrint } from './invoices-api';
import { PrintLogo } from '../../app/branding';
import { useAuth } from '../../auth/AuthProvider';
import { PERMISSIONS } from '@tiles-erp/config';

/** A4/A5 for sheet copies, 80mm and 58mm for the counter roll printers. */
type PaperSize = 'A4' | 'A5' | '80mm' | '58mm';
type InvoiceDocument = 'tax' | 'proforma' | 'delivery' | 'items';

const PAPER_LABELS: Record<PaperSize, string> = {
  A4: 'A4',
  A5: 'A5',
  '80mm': '80 mm roll',
  '58mm': '58 mm roll',
};

const isPaperSize = (value: string | null): value is PaperSize =>
  value !== null && value in PAPER_LABELS;

const DOCUMENT_LABELS: Record<InvoiceDocument, string> = {
  tax: 'Tax invoice',
  proforma: 'Proforma invoice',
  delivery: 'Delivery slip',
  items: 'Item list',
};

const isInvoiceDocument = (value: string | null): value is InvoiceDocument =>
  value !== null && value in DOCUMENT_LABELS;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

const quantity = (line: SalesInvoiceLineItem): string =>
  formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE');

/** Keep piece-only products out of the BOX column on every print layout. */
const printedBoxes = (line: SalesInvoiceLineItem): number =>
  line.baseUom === 'PIECE' || line.piecesPerBox === 1 ? 0 : line.boxes;

const printedPieces = (line: SalesInvoiceLineItem): number =>
  line.baseUom === 'PIECE' || line.piecesPerBox === 1
    ? Math.round(line.qtyBoxes * Math.max(line.piecesPerBox, 1))
    : line.pieces;

const totalWeightKg = (lines: SalesInvoiceLineItem[]): number =>
  lines.reduce(
    (sum, line) => sum + line.qtyBoxes * line.piecesPerBox * (line.weightKg ?? 0),
    0,
  );

const weight = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pageStyle = (paper: PaperSize): string => {
  if (paper === 'A4') return `@page { size: A4 portrait; margin: 12mm 10mm; }`;
  if (paper === 'A5') return `@page { size: A5 portrait; margin: 5mm; }`;
  return `@page { size: ${paper === '80mm' ? '80mm' : '58mm'} auto; margin: 3mm; }`;
};

export function SalesInvoicePrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('paper');
  const requestedDocument = searchParams.get('document');
  const canPrintDeliverySlip = hasPermission(PERMISSIONS.DELIVERY_SLIP_PRINT);
  const deliveryOnlyUser = Boolean(
    user?.roles.includes('DELIVERY SLIP PRINT') &&
    !user.roles.some((role) => role !== 'DELIVERY SLIP PRINT'),
  );
  const requestedType = isInvoiceDocument(requestedDocument) ? requestedDocument : 'tax';
  const initialDocument = deliveryOnlyUser ? 'delivery' : requestedType;
  const [paper, setPaper] = useState<PaperSize>(
    isPaperSize(requested)
      ? requested
      : initialDocument === 'delivery'
        ? '80mm'
        : initialDocument === 'proforma'
          ? 'A5'
          : 'A4',
  );
  const [documentType, setDocumentType] = useState<InvoiceDocument>(initialDocument);
  const [deliveryPrinted, setDeliveryPrinted] = useState(false);
  const invoicePrint = useSalesInvoicePrint(documentType === 'delivery' ? null : (id ?? null));
  const deliveryPreview = useDeliverySlipPreview(documentType === 'delivery' ? (id ?? null) : null);
  const claimDeliveryPrint = useClaimDeliverySlipPrint();
  const activePrint = documentType === 'delivery' ? deliveryPreview : invoicePrint;
  const { data, isLoading, isError, error } = activePrint;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = pageStyle(paper);
    document.head.appendChild(style);
    return () => style.remove();
  }, [paper]);

  if (isLoading) return <LoadingOverlay open />;
  if (isError || !data) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'That invoice could not be loaded.'}
        </Alert>
      </Box>
    );
  }

  const isRoll = paper === '80mm' || paper === '58mm';
  const sheetWidth = paper === 'A4' ? '190mm' : paper === 'A5' ? '138mm' : paper === '80mm' ? '74mm' : '52mm';

  return (
    <Box>
      <Stack
        className="print-hidden"
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        {claimDeliveryPrint.isError && (
          <Alert severity="error" sx={{ mr: 1 }}>
            {claimDeliveryPrint.error instanceof Error
              ? claimDeliveryPrint.error.message
              : 'The delivery slip could not be printed.'}
          </Alert>
        )}
        <Button
          color="inherit"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(deliveryOnlyUser ? '/delivery-slips' : '/sales-invoices')}
        >
          Back
        </Button>
        <TextField
          select
          label="Document"
          size="small"
          fullWidth={false}
          value={documentType}
          onChange={(e) => {
            const next = e.target.value as InvoiceDocument;
            setDocumentType(next);
            if (next === 'delivery') setPaper('80mm');
            if (next === 'proforma') setPaper('A5');
            if (next === 'tax') setPaper('A4');
            if (next === 'items') setPaper('A4');
          }}
          sx={{ width: 190 }}
        >
          {(Object.keys(DOCUMENT_LABELS) as InvoiceDocument[]).filter((type) =>
            deliveryOnlyUser
              ? type === 'delivery'
              : type !== 'delivery' || canPrintDeliverySlip,
          ).map((type) => (
            <MenuItem key={type} value={type}>
              {DOCUMENT_LABELS[type]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Paper"
          size="small"
          fullWidth={false}
          value={paper}
          onChange={(e) => setPaper(e.target.value as PaperSize)}
          disabled={documentType === 'proforma'}
          sx={{ width: 170 }}
        >
          {(Object.keys(PAPER_LABELS) as PaperSize[]).map((size) => (
            <MenuItem key={size} value={size}>
              {PAPER_LABELS[size]}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          disabled={documentType === 'delivery' && (!canPrintDeliverySlip || deliveryPrinted || claimDeliveryPrint.isPending)}
          onClick={() => {
            if (documentType !== 'delivery') {
              window.print();
              return;
            }
            if (!id || deliveryPrinted || claimDeliveryPrint.isPending) return;

            // Lock this page immediately. The API claim provides the permanent lock, so
            // returning to the invoice cannot obtain another copy from cached page data.
            setDeliveryPrinted(true);
            void claimDeliveryPrint.mutateAsync(id).then(() => {
              window.print();
            }).catch(() => {
              // Keep the button locked: an uncertain network response may still have
              // recorded the print claim. A fresh attempt asks the server for the truth.
            });
          }}
        >
          {documentType === 'delivery' && claimDeliveryPrint.isPending ? 'Preparing…' : 'Print'}
        </Button>
      </Stack>

      <style>{`
        .inv-sheet {
          width: ${sheetWidth};
          margin: 12px auto;
          background: #fff;
          color: #000;
          font-family: ${isRoll ? "'Courier New', monospace" : "'Helvetica Neue', Arial, sans-serif"};
          font-size: ${isRoll ? (paper === '58mm' ? '10px' : '11px') : '12px'};
          line-height: 1.35;
          padding: ${isRoll ? '4px' : '0'};
        }
        .inv-sheet table { width: 100%; border-collapse: collapse; }
        .inv-sheet th, .inv-sheet td { padding: ${isRoll ? '1px 0' : '4px 6px'}; }
        .inv-sheet.paper-A5 { font-size: 9px; line-height: 1.2; }
        .inv-sheet.paper-A5 th, .inv-sheet.paper-A5 td { padding: 2px 3px; }
        .inv-sheet.paper-A5 .title { font-size: 14px; }
        .inv-sheet.paper-A5 .doc-title { padding: 3px 0; }
        .inv-sheet.paper-A5 .fine { font-size: 8px; }
        .inv-sheet .rule { border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000; }
        .inv-sheet .print-item-grid > thead > tr > th,
        .inv-sheet .print-item-grid > tbody > tr > td {
          border: 1px solid #000;
        }
        .inv-sheet .num { text-align: right; white-space: nowrap; }
        .inv-sheet .muted { color: ${isRoll ? '#000' : '#555'}; }
        .inv-sheet .title {
          font-weight: 700;
          font-size: ${isRoll ? '13px' : '18px'};
        }
        .inv-sheet .doc-title {
          text-align: center;
          font-weight: 700;
          letter-spacing: 1px;
          padding: ${isRoll ? '2px 0' : '6px 0'};
        }
        .inv-sheet .fine { font-size: ${isRoll ? '9px' : '10px'}; }
        .inv-sheet .item-list-sheet { font-size: 14px; }
        .inv-sheet .item-list-sheet .title { font-size: 20px; }
        .inv-sheet.paper-A5 .item-list-sheet { font-size: 11px; }
        .inv-sheet.paper-A5 .item-list-sheet .title { font-size: 16px; }
        .inv-sheet .godown-slip {
          display: block;
          width: 100%;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .inv-sheet .godown-slip + .godown-slip {
          break-before: page;
          page-break-before: always;
        }
        .inv-sheet .delivery-slip {
          font-family: "Arial Black", Arial, Helvetica, sans-serif;
          font-size: ${isRoll ? (paper === '58mm' ? '11px' : '12px') : '13px'};
          line-height: 1.3;
          font-weight: 900;
          color: #000;
          opacity: 1;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .inv-sheet .delivery-slip * {
          color: #000;
          opacity: 1;
          font-weight: 900;
        }
        .inv-sheet .delivery-slip th,
        .inv-sheet .delivery-slip td { font-weight: 900; }
        .inv-sheet .delivery-slip .rule { border-top: 1px solid #000; }
        .inv-sheet .delivery-slip .doc-title { font-size: ${isRoll ? '14px' : '16px'}; font-weight: 900; }
        .inv-sheet .proforma-sheet {
          color: #000;
          font-family: "Times New Roman", Times, serif;
          font-size: 9px;
          line-height: 1.18;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .inv-sheet .proforma-sheet table { table-layout: fixed; }
        .inv-sheet .proforma-sheet th,
        .inv-sheet .proforma-sheet td {
          border: 1px solid #000;
          padding: 2px 4px;
          color: #000;
        }
        .inv-sheet .proforma-sheet .proforma-title {
          background: #000;
          color: #fff;
          font-weight: 700;
          text-align: center;
          letter-spacing: .5px;
          padding: 3px;
        }
        .inv-sheet .proforma-sheet .no-border,
        .inv-sheet .proforma-sheet .no-border td { border: 0; }
        .inv-sheet .proforma-sheet .item-grid thead { display: table-header-group; }
        .inv-sheet .proforma-sheet .item-grid tr { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          body * { visibility: hidden !important; }
          .inv-sheet, .inv-sheet * { visibility: visible !important; }
          .print-hidden, .print-hidden * { display: none !important; }
          .inv-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          body { background: #fff; }
        }
      `}</style>

      <Box className={`inv-sheet paper-${paper}`}>
        <PrintBody data={data} isRoll={isRoll} documentType={documentType} />
      </Box>
    </Box>
  );
}

/** The tax invoice itself: one column on a roll, a full GST layout on A4. */
function PrintBody({
  data,
  isRoll,
  documentType,
}: {
  data: SalesInvoicePrintData;
  isRoll: boolean;
  documentType: InvoiceDocument;
}): JSX.Element {
  const { invoice, company, branch, terms, declaration, customerPincode } = data;
  const lines = invoice.lines ?? [];
  const charges = invoice.freightCharge + invoice.unloadingCharge + invoice.loadingCharge;
  const totalWeight = totalWeightKg(lines);

  if (documentType === 'delivery') {
    return <DeliverySlip data={data} isRoll={isRoll} />;
  }

  if (documentType === 'proforma' && !isRoll) {
    return <ProformaInvoice data={data} />;
  }

  if (documentType === 'items') {
    return <InvoiceItemList data={data} />;
  }

  const documentTitle = documentType === 'proforma' ? 'PROFORMA INVOICE' : 'TAX INVOICE';

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <PrintLogo />
        <div className="title">{company.legalName ?? company.name}</div>
        {branch.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div>{[branch.phone, branch.email].filter(Boolean).join('  ·  ')}</div>
        {(branch.gstin ?? company.gstin) && (
          <div>
            <strong>GSTIN {branch.gstin ?? company.gstin}</strong>
          </div>
        )}
      </div>

      <div className="rule doc-title">
        {documentTitle}
        {invoice.status === 'CANCELLED' ? ' — CANCELLED' : ''}
      </div>

      {isRoll ? (
        <div>
          <div>
            <strong>No:</strong> {invoice.invoiceNumber}
          </div>
          <div>
            <strong>Date:</strong> {date(invoice.invoiceDate)}
          </div>
          <div className="rule" />
          <div>
            <strong>{invoice.customerName}</strong>
          </div>
          {invoice.customerAddress && <div>{invoice.customerAddress}</div>}
          <div>Pincode: {customerPincode || '-'}</div>
          {invoice.customerMobile && <div>Mob: {invoice.customerMobile}</div>}
          {invoice.customerGstin && <div>GSTIN: {invoice.customerGstin}</div>}
        </div>
      ) : (
        <table className="rule">
          <tbody>
            <tr>
              <td style={{ width: '55%', verticalAlign: 'top' }}>
                <div className="muted">Billed to</div>
                <div>
                  <strong>{invoice.customerName}</strong>
                </div>
                {invoice.customerAddress && <div>{invoice.customerAddress}</div>}
                <div>Pincode: {customerPincode || '-'}</div>
                {invoice.customerMobile && <div>Mobile: {invoice.customerMobile}</div>}
                {invoice.customerGstin && <div>GSTIN: {invoice.customerGstin}</div>}
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <table>
                  <tbody>
                    <tr>
                      <td className="muted">Invoice no</td>
                      <td>
                        <strong>{invoice.invoiceNumber}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Date</td>
                      <td>{date(invoice.invoiceDate)}</td>
                    </tr>
                    {invoice.dueDate && (
                      <tr>
                        <td className="muted">Due date</td>
                        <td>{date(invoice.dueDate)}</td>
                      </tr>
                    )}
                    {invoice.orderNumber && (
                      <tr>
                        <td className="muted">Order</td>
                        <td>{invoice.orderNumber}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="muted">Place of supply</td>
                      <td>{invoice.placeOfSupply ?? '—'}</td>
                    </tr>
                    {invoice.salesmanName && (
                      <tr>
                        <td className="muted">Salesman</td>
                        <td>{invoice.salesmanName}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <table className="print-item-grid" style={{ marginTop: isRoll ? 2 : 8 }}>
        <thead>
          <tr className="rule">
            {!isRoll && <th style={{ width: 26, textAlign: 'left' }}>#</th>}
            <th style={{ textAlign: 'left' }}>Item</th>
            {!isRoll && <th style={{ width: 80 }}>HSN</th>}
            {!isRoll && (
              <th className="num" style={{ width: 100 }}>
                Qty
              </th>
            )}
            {!isRoll && (
              <th className="num" style={{ width: 85 }}>
                Rate
              </th>
            )}
            {!isRoll && (
              <th className="num" style={{ width: 60 }}>
                GST%
              </th>
            )}
            {!isRoll && (
              <th className="num" style={{ width: 95 }}>
                Amount
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) =>
            isRoll ? (
              <tr key={line.id}>
                <td>
                  <div>
                    {index + 1}. {line.productName}
                    {line.sizeMm ? ` (${line.sizeMm})` : ''}
                  </div>
                  <table>
                    <tbody>
                      <tr>
                        <td>{quantity(line)}</td>
                        <td className="num">x {money(line.rate)}</td>
                        <td className="num">
                          <strong>{money(line.lineTotal)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            ) : (
              <tr key={line.id} className="rule">
                <td>{index + 1}</td>
                <td>
                  {line.productName}
                  {line.sizeMm && <span className="muted"> · {line.sizeMm}</span>}
                  {line.batchNo && <span className="muted"> · {line.batchNo}</span>}
                </td>
                <td>{line.hsnCode ?? '—'}</td>
                <td className="num">{quantity(line)}</td>
                <td className="num">{money(line.rate)}</td>
                <td className="num">{line.gstRate}</td>
                <td className="num">{money(line.lineTotal)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
        <tbody>
          {!isRoll && (
            <tr>
              <td rowSpan={7} style={{ verticalAlign: 'top', width: '55%' }}>
                <div className="muted">Amount in words</div>
                <div>
                  <strong>{amountInWords(invoice.grandTotal)}</strong>
                </div>
                {invoice.remarks && (
                  <div style={{ marginTop: 6 }}>
                    <span className="muted">Remarks: </span>
                    {invoice.remarks}
                  </div>
                )}
              </td>
              <td className="muted">Taxable value</td>
              <td className="num">{money(invoice.subTotal)}</td>
            </tr>
          )}
          {isRoll && (
            <tr>
              <td className="muted">Taxable value</td>
              <td className="num">{money(invoice.subTotal)}</td>
            </tr>
          )}
          {invoice.isInterState ? (
            <tr>
              <td className="muted">IGST</td>
              <td className="num">{money(invoice.igstAmount)}</td>
            </tr>
          ) : (
            <>
              <tr>
                <td className="muted">CGST</td>
                <td className="num">{money(invoice.cgstAmount)}</td>
              </tr>
              <tr>
                <td className="muted">SGST</td>
                <td className="num">{money(invoice.sgstAmount)}</td>
              </tr>
            </>
          )}
          {charges > 0 && (
            <tr>
              <td className="muted">Freight &amp; handling</td>
              <td className="num">{money(charges)}</td>
            </tr>
          )}
          {invoice.roundOff !== 0 && (
            <tr>
              <td className="muted">Round off</td>
              <td className="num">{money(invoice.roundOff)}</td>
            </tr>
          )}
          <tr className="rule">
            <td>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{money(invoice.grandTotal)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="rule" style={{ marginTop: 4 }}>
        <strong>Total product weight: {weight(totalWeight)} kg</strong>
      </div>

      {isRoll && (
        <div style={{ marginTop: 2 }}>
          <div className="rule" />
          <div>{amountInWords(invoice.grandTotal)}</div>
          {invoice.salesmanName && <div>Salesman: {invoice.salesmanName}</div>}
        </div>
      )}

      {terms.length > 0 && (
        <div className="fine" style={{ marginTop: isRoll ? 4 : 10 }}>
          <div className="rule" />
          <div>
            <strong>Terms &amp; conditions</strong>
          </div>
          <ol style={{ margin: '2px 0 0 16px', padding: 0 }}>
            {terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </div>
      )}

      {!isRoll && declaration && (
        <div className="fine" style={{ marginTop: 8 }}>
          <strong>Declaration:</strong> {declaration}
        </div>
      )}

      <div style={{ marginTop: isRoll ? 6 : 20, textAlign: isRoll ? 'center' : 'right' }}>
        {isRoll ? (
          <div>Thank you for your business</div>
        ) : (
          <>
            <div>For {company.legalName ?? company.name}</div>
            <div style={{ marginTop: 28 }} className="muted">
              Authorised signatory
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Warehouse-friendly invoice item list without prices or tax values. */
function InvoiceItemList({ data }: { data: SalesInvoicePrintData }): JSX.Element {
  const { invoice, company, branch, customerPincode } = data;
  const lines = invoice.lines ?? [];
  const totalBoxes = lines.reduce((sum, line) => sum + printedBoxes(line), 0);
  const totalPieces = lines.reduce((sum, line) => sum + printedPieces(line), 0);
  const totalWeight = totalWeightKg(lines);
  return (
    <div className="item-list-sheet">
      <div style={{ textAlign: 'center' }}>
        <PrintLogo />
        <div className="title">{company.legalName ?? company.name}</div>
        <div>{branch.name}</div>
      </div>
      <div className="rule doc-title">SALES INVOICE ITEM LIST</div>
      <table>
        <tbody>
          <tr>
            <td><strong>Invoice:</strong> {invoice.invoiceNumber}</td>
            <td><strong>Date:</strong> {date(invoice.invoiceDate)}</td>
          </tr>
          <tr>
            <td><strong>Customer:</strong> {invoice.customerName} · <strong>Pincode:</strong> {customerPincode || '-'}</td>
            <td><strong>Salesman:</strong> {invoice.salesmanName ?? '—'}</td>
          </tr>
          <tr>
            <td><strong>Address:</strong> {invoice.customerAddress || '—'}</td>
            <td><strong>Phone:</strong> {invoice.customerMobile || '—'}</td>
          </tr>
          {invoice.orderNumber && <tr><td colSpan={2}><strong>Sales order:</strong> {invoice.orderNumber}</td></tr>}
        </tbody>
      </table>
      <table className="print-item-grid" style={{ marginTop: 8 }}>
        <thead>
          <tr className="rule">
            <th style={{ width: 28, textAlign: 'left' }}>#</th>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ width: 95, textAlign: 'left' }}>Size</th>
            <th className="num" style={{ width: 55 }}>Box</th>
            <th className="num" style={{ width: 55 }}>Pcs</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} className="rule">
              <td>{index + 1}</td>
              <td>{line.productName}</td>
              <td>{line.sizeMm ?? '—'}</td>
              <td className="num">{printedBoxes(line)}</td>
              <td className="num">{printedPieces(line)}</td>
            </tr>
          ))}
          <tr className="rule">
            <td colSpan={3}><strong>Total items: {lines.length}</strong></td>
            <td className="num"><strong>{totalBoxes}</strong></td>
            <td className="num"><strong>{totalPieces}</strong></td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}><strong>Total product weight: {weight(totalWeight)} kg</strong></div>
      {invoice.remarks && <div style={{ marginTop: 8 }}><strong>Remarks:</strong> {invoice.remarks}</div>}
      <div style={{ minHeight: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        <strong>Customer signature</strong>
      </div>
    </div>
  );
}

/** A5 proforma copy matching the compact counter format used by Avthar Ceramics. */
function ProformaInvoice({ data }: { data: SalesInvoicePrintData }): JSX.Element {
  const { invoice, company, branch, terms, customerPincode } = data;
  const lines = invoice.lines ?? [];
  const totalBoxes = lines.reduce((sum, line) => sum + printedBoxes(line), 0);
  const totalPieces = lines.reduce((sum, line) => sum + printedPieces(line), 0);
  const itemTotal = lines.reduce((sum, line) => sum + line.lineSubTotal, 0);
  const totalWeight = totalWeightKg(lines);
  const emptyRows = Array.from({ length: Math.max(0, 17 - lines.length) });
  const companyName = company.legalName ?? company.name;
  const gstin = branch.gstin ?? company.gstin;
  const invoiceDate = new Date(invoice.invoiceDate);
  const formattedDate = [
    String(invoiceDate.getDate()).padStart(2, '0'),
    String(invoiceDate.getMonth() + 1).padStart(2, '0'),
    invoiceDate.getFullYear(),
  ].join('-');

  return (
    <div className="proforma-sheet">
      <div style={{ textAlign: 'right', fontSize: 7, marginBottom: 2 }}>
        ORIGINAL / DUPLICATE / TRIPLICATE
      </div>

      <div style={{ border: '1px solid #000', padding: '7px 4px' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{companyName}</div>
        <div style={{ marginTop: 3 }}>{branch.addressLines.join(', ')}</div>
        {branch.phone && <div>PHONE : {branch.phone}</div>}
        {gstin && <div>GST No : {gstin}</div>}
      </div>

      <div className="proforma-title">PROFORMA INVOICE</div>

      <table>
        <tbody>
          <tr>
            <td style={{ width: '58%', height: 76, verticalAlign: 'top' }}>
              <strong>To</strong>
              <div style={{ marginTop: 8 }}>{invoice.customerName}</div>
              {invoice.customerAddress && <div>{invoice.customerAddress}</div>}
              <div>Pincode : {customerPincode || '-'}</div>
              <div>Phone : {invoice.customerMobile || '-'}</div>
            </td>
            <td style={{ padding: 0, verticalAlign: 'top' }}>
              <table className="no-border">
                <tbody>
                  <tr><td><strong>Order No</strong></td><td>: {invoice.invoiceNumber}</td></tr>
                  <tr><td><strong>Order Date</strong></td><td>: {formattedDate}</td></tr>
                  <tr><td><strong>SalesMan</strong></td><td>: {invoice.salesmanName || '-'}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="item-grid">
        <thead>
          <tr>
            <th style={{ width: 18 }}>S/N</th>
            <th style={{ textAlign: 'center' }}>Description</th>
            <th className="num" style={{ width: 32 }}>BOX</th>
            <th className="num" style={{ width: 32 }}>PCS</th>
            <th className="num" style={{ width: 48 }}>Rate</th>
            <th className="num" style={{ width: 62 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id} style={{ height: 13 }}>
              <td style={{ textAlign: 'center' }}>{index + 1}</td>
              <td>{line.productName}{line.sizeMm ? ` (${line.sizeMm})` : ''}</td>
              <td className="num">{printedBoxes(line)}</td>
              <td className="num">{printedPieces(line)}</td>
              <td className="num">{money(line.rate)}</td>
              <td className="num">{money(line.lineSubTotal)}</td>
            </tr>
          ))}
          {emptyRows.map((_, index) => (
            <tr key={`blank-${index}`} aria-hidden="true" style={{ height: 13 }}>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2}><strong>Total Items : {lines.length}</strong></td>
            <td className="num"><strong>{totalBoxes}</strong></td>
            <td className="num"><strong>{totalPieces}</strong></td>
            <td className="num"><strong>Total :</strong></td>
            <td className="num"><strong>{money(itemTotal)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 3 }}><strong>Total product weight: {weight(totalWeight)} kg</strong></div>

      <table>
        <tbody>
          <tr>
            <td style={{ width: '48%', height: 94, verticalAlign: 'top' }}>
              <strong>{amountInWords(invoice.grandTotal).toUpperCase()}</strong>
              {invoice.remarks && <div style={{ marginTop: 8 }}><strong>Remarks:</strong> {invoice.remarks}</div>}
            </td>
            <td style={{ padding: 0, verticalAlign: 'top' }}>
              <table>
                <tbody>
                  <tr><td>ADD : AUTO FREIGHT</td><td className="num">{money(invoice.freightCharge)}</td></tr>
                  <tr><td>ADD : UNLOADING</td><td className="num">{money(invoice.unloadingCharge)}</td></tr>
                  <tr><td>ADD : LOADING CHARGE</td><td className="num">{money(invoice.loadingCharge)}</td></tr>
                  {invoice.isInterState ? (
                    <tr><td>TOTAL IGST</td><td className="num">{money(invoice.igstAmount)}</td></tr>
                  ) : (
                    <>
                      <tr><td>TOTAL CGST</td><td className="num">{money(invoice.cgstAmount)}</td></tr>
                      <tr><td>TOTAL SGST</td><td className="num">{money(invoice.sgstAmount)}</td></tr>
                    </>
                  )}
                  <tr><td>ADD/LESS : Round Off</td><td className="num">{money(invoice.roundOff)}</td></tr>
                  <tr><td><strong>NET AMOUNT</strong></td><td className="num"><strong>{money(invoice.grandTotal)}</strong></td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td style={{ width: '58%', height: 53, verticalAlign: 'top', fontSize: 7.5 }}>
              {terms.map((term) => <div key={term}>{term}</div>)}
            </td>
            <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
              <strong>For {companyName}</strong>
              <div style={{ marginTop: 30 }}><strong>Authorised Signatory</strong></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A delivery copy deliberately excludes rates, tax values and invoice totals. */
function DeliverySlip({ data, isRoll }: { data: SalesInvoicePrintData; isRoll: boolean }): JSX.Element {
  const { invoice, company, branch, customerPincode } = data;
  const lines = data.deliveryLines ?? invoice.lines ?? [];
  const godowns = Array.from(
    lines.reduce((groups, line) => {
      const group = groups.get(line.godownId) ?? { name: line.godownName, lines: [] as SalesInvoiceLineItem[] };
      group.lines.push(line);
      groups.set(line.godownId, group);
      return groups;
    }, new Map<string, { name: string; lines: SalesInvoiceLineItem[] }>()),
  ).map(([id, group]) => ({ id, ...group }));

  return (
    <>
      {godowns.map((godown, godownIndex) => {
        const totalBoxes = godown.lines.reduce((sum, line) => sum + printedBoxes(line), 0);
        const totalPieces = godown.lines.reduce((sum, line) => sum + printedPieces(line), 0);
        const totalWeight = totalWeightKg(godown.lines);
        return (
          <div
            className="godown-slip delivery-slip"
            data-godown-id={godown.id}
            key={godown.id}
            style={{ padding: isRoll ? '2px' : 0 }}
          >
            <div className="doc-title" style={{ borderBottom: '1px solid #000' }}>DELIVERY SLIP</div>
            {isRoll ? (
              <div aria-label={`Barcode ${invoice.invoiceNumber}`} style={{ margin: '3px 8px', height: 26, border: '1px solid #000', background: 'repeating-linear-gradient(90deg,#000 0,#000 2px,#fff 2px,#fff 4px,#000 4px,#000 5px,#fff 5px,#fff 8px)' }} />
            ) : (
              <div style={{ textAlign: 'center' }}><PrintLogo /><div className="title">{company.legalName ?? company.name}</div></div>
            )}
            <div style={{ textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>{godown.name.toUpperCase()}</div>
            {godowns.length > 1 && (
              <div className="fine" style={{ textAlign: 'center' }}>
                Godown slip {godownIndex + 1} of {godowns.length}
              </div>
            )}
            {!isRoll && <div style={{ textAlign: 'center' }}>{branch.addressLines.join(' · ')}</div>}
            <div style={{ marginTop: 5 }}><strong>Customer :</strong> {invoice.customerName}</div>
            {invoice.customerAddress && <div><strong>Address :</strong> {invoice.customerAddress}</div>}
            <div><strong>Pincode :</strong> {customerPincode || '-'}</div>
            {invoice.customerMobile && <div><strong>Phone :</strong> {invoice.customerMobile}</div>}
            <div><strong>Order No :</strong> {invoice.invoiceNumber}</div>
            <div><strong>Order Date :</strong> {date(invoice.invoiceDate)}</div>
            {invoice.salesmanName && <div><strong>SalesMan :</strong> {invoice.salesmanName}</div>}
            <table className="print-item-grid" style={{ marginTop: 5, border: '1px solid #000' }}>
              <thead><tr>
                <th style={{ width: 18, borderRight: '1px solid #000' }}>#</th>
                <th style={{ textAlign: 'left', borderRight: '1px solid #000' }}>Description</th>
                <th style={{ width: 48, borderRight: '1px solid #000' }}>Size</th>
                <th className="num" style={{ width: 28, borderRight: '1px solid #000' }}>BOX</th>
                <th className="num" style={{ width: 28 }}>Pcs</th>
              </tr></thead>
              <tbody>
                {godown.lines.map((line, index) => (
                  <tr key={line.id} className="rule">
                    <td>{index + 1}</td><td><strong>{line.productName}</strong></td>
                    <td>{line.sizeMm ?? '—'}</td><td className="num">{printedBoxes(line)}</td><td className="num">{printedPieces(line)}</td>
                  </tr>
                ))}
                <tr className="rule"><td colSpan={3} className="num"><strong>Total</strong></td><td className="num"><strong>{totalBoxes}</strong></td><td className="num"><strong>{totalPieces}</strong></td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 4 }}><strong>Total product weight: {weight(totalWeight)} kg</strong></div>
            {invoice.remarks && <div style={{ marginTop: 4 }}><strong>Remarks:</strong> {invoice.remarks}</div>}
            {!isRoll && <div style={{ marginTop: 42, textAlign: 'right' }}>Received by customer</div>}
          </div>
        );
      })}
    </>
  );
}
