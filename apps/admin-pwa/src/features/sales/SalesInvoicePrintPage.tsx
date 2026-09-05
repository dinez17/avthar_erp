import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { amountInWords, formatBoxPieces } from '@tiles-erp/shared';
import type { SalesInvoiceLineItem, SalesInvoicePrintData } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useSalesInvoicePrint } from './invoices-api';

/** A4 for the customer copy and the file, 80mm and 58mm for the counter roll printers. */
type PaperSize = 'A4' | '80mm' | '58mm';

const PAPER_LABELS: Record<PaperSize, string> = {
  A4: 'A4',
  '80mm': '80 mm roll',
  '58mm': '58 mm roll',
};

const isPaperSize = (value: string | null): value is PaperSize =>
  value !== null && value in PAPER_LABELS;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

const quantity = (line: SalesInvoiceLineItem): string =>
  formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE');

const pageStyle = (paper: PaperSize): string => {
  if (paper === 'A4') return `@page { size: A4 portrait; margin: 12mm 10mm; }`;
  return `@page { size: ${paper === '80mm' ? '80mm' : '58mm'} auto; margin: 3mm; }`;
};

export function SalesInvoicePrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('paper');
  const [paper, setPaper] = useState<PaperSize>(isPaperSize(requested) ? requested : 'A4');
  const { data, isLoading, isError } = useSalesInvoicePrint(id ?? null);

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
        <Alert severity="error">That invoice could not be loaded.</Alert>
      </Box>
    );
  }

  const isRoll = paper !== 'A4';
  const sheetWidth = paper === 'A4' ? '190mm' : paper === '80mm' ? '74mm' : '52mm';

  return (
    <Box>
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
          onClick={() => navigate('/sales-invoices')}
        >
          Back
        </Button>
        <TextField
          select
          label="Paper"
          size="small"
          fullWidth={false}
          value={paper}
          onChange={(e) => setPaper(e.target.value as PaperSize)}
          sx={{ width: 170 }}
        >
          {(Object.keys(PAPER_LABELS) as PaperSize[]).map((size) => (
            <MenuItem key={size} value={size}>
              {PAPER_LABELS[size]}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print
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
        .inv-sheet .rule { border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000; }
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

      <Box className="inv-sheet">
        <PrintBody data={data} isRoll={isRoll} />
      </Box>
    </Box>
  );
}

/** The tax invoice itself: one column on a roll, a full GST layout on A4. */
function PrintBody({ data, isRoll }: { data: SalesInvoicePrintData; isRoll: boolean }): JSX.Element {
  const { invoice, company, branch, terms, declaration } = data;
  const lines = invoice.lines ?? [];
  const charges = invoice.freightCharge + invoice.unloadingCharge + invoice.loadingCharge;

  return (
    <>
      <div style={{ textAlign: 'center' }}>
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
        TAX INVOICE
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

      <table style={{ marginTop: isRoll ? 2 : 8 }}>
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
