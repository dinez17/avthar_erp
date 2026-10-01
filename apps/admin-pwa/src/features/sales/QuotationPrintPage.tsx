import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { amountInWords } from '@tiles-erp/shared';
import type { QuotationLineItem, QuotationPrintData } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useQuotationPrint } from './api';
import { PrintLogo } from '../../app/branding';

/** A5 for the estimate copy, 80mm and 58mm for the counter roll printers. */
type PaperSize = 'A5' | '80mm' | '58mm';

const PAPER_LABELS: Record<PaperSize, string> = {
  A5: 'A5 estimate',
  '80mm': '80 mm roll',
  '58mm': '58 mm roll',
};

const isPaperSize = (value: string | null): value is PaperSize =>
  value !== null && value in PAPER_LABELS;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Quotation rates are stored before GST; estimate copies show the customer-facing rate. */
const rateIncludingGst = (line: QuotationLineItem): number =>
  Math.round(line.rate * (1 + line.gstRate / 100) * 100) / 100;

const date = (value: string): string => {
  const parsed = new Date(value);
  return [
    String(parsed.getDate()).padStart(2, '0'),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    parsed.getFullYear(),
  ].join('-');
};

/** Prints the quantity as it was entered: "10 box 2 pcs", or "12 pcs" for loose goods. */
const quantity = (line: QuotationLineItem): string => {
  if (line.boxes <= 0) return `${line.pieces} pcs`;
  return line.pieces > 0 ? `${line.boxes} box ${line.pieces} pcs` : `${line.boxes} box`;
};

const totalWeightKg = (lines: QuotationLineItem[]): number =>
  lines.reduce(
    (sum, line) => sum + line.qtyBoxes * line.piecesPerBox * (line.weightKg ?? 0),
    0,
  );

const weight = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Page rules per paper size. Roll printers have no margins to speak of and a fixed
 * width, so the sheet is sized in millimetres and the height left to the content.
 */
const pageStyle = (paper: PaperSize): string => {
  if (paper === 'A5') {
    return `@page { size: A5 portrait; margin: 5mm; }`;
  }
  const width = paper === '80mm' ? '80mm' : '58mm';
  return `@page { size: ${width} auto; margin: 3mm; }`;
};

export function QuotationPrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // The list passes the size the operator chose; the toolbar can still change it.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('paper');
  const [paper, setPaper] = useState<PaperSize>(isPaperSize(requested) ? requested : 'A5');
  const { data, isLoading, isError } = useQuotationPrint(id ?? null);

  // The page rules have to live in the document head for the browser to honour them.
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
        <Alert severity="error">That quotation could not be loaded.</Alert>
      </Box>
    );
  }

  const isRoll = paper !== 'A5';
  const sheetWidth = paper === 'A5' ? '138mm' : paper === '80mm' ? '74mm' : '52mm';

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
          onClick={() => navigate('/quotations')}
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
        .quote-sheet {
          width: ${sheetWidth};
          margin: 12px auto;
          background: #fff;
          color: #000;
          font-family: ${isRoll ? "'Courier New', monospace" : "'Helvetica Neue', Arial, sans-serif"};
          font-size: ${isRoll ? (paper === '58mm' ? '10px' : '11px') : '10px'};
          line-height: 1.35;
          padding: ${isRoll ? '4px' : '0'};
        }
        .quote-sheet table { width: 100%; border-collapse: collapse; }
        .quote-sheet th, .quote-sheet td { padding: ${isRoll ? '1px 0' : '4px 6px'}; }
        .quote-sheet .rule { border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000; }
        .quote-sheet .num { text-align: right; white-space: nowrap; }
        .quote-sheet .muted { color: ${isRoll ? '#000' : '#555'}; }
        .quote-sheet .title {
          font-weight: 700;
          font-size: ${isRoll ? '13px' : '18px'};
          letter-spacing: ${isRoll ? '0' : '0.5px'};
        }
        .quote-sheet .doc-title {
          text-align: center;
          font-weight: 700;
          letter-spacing: 1px;
          padding: ${isRoll ? '2px 0' : '6px 0'};
        }
        .quote-sheet .terms { font-size: ${isRoll ? '9px' : '10px'}; }
        .quote-sheet .estimate-table th,
        .quote-sheet .estimate-table td {
          border: 1px solid #000;
          padding: 2px 4px;
          line-height: 1.2;
        }
        .quote-sheet .estimate-table thead { display: table-header-group; }
        .quote-sheet .estimate-table tr { break-inside: avoid; page-break-inside: avoid; }
        .quote-sheet .print-item-grid > thead > tr > th,
        .quote-sheet .print-item-grid > tbody > tr > td {
          border: 1px solid #000;
        }
        .quote-sheet .estimate-title {
          background: #000;
          color: #fff;
          text-align: center;
          font-weight: 700;
          letter-spacing: 0.8px;
          padding: 3px 0;
        }
        @media print {
          /*
           * Only the sheet reaches the paper. Hiding everything and re-showing the
           * document also covers anything the app shell mounts outside this route,
           * such as toasts or a service-worker update banner.
           */
          body * { visibility: hidden !important; }
          .quote-sheet, .quote-sheet * { visibility: visible !important; }
          .print-hidden, .print-hidden * { display: none !important; }
          .quote-sheet {
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

      <Box className="quote-sheet">
        <PrintBody data={data} isRoll={isRoll} />
      </Box>
    </Box>
  );
}

/** The estimate follows the A5 reference; roll copies retain their compact layout. */
function PrintBody({ data, isRoll }: { data: QuotationPrintData; isRoll: boolean }): JSX.Element {
  const { quotation, company, branch, terms, customerPincode } = data;
  const lines = quotation.lines ?? [];
  const charges =
    quotation.freightCharge + quotation.unloadingCharge + quotation.loadingCharge;
  const totalWeight = totalWeightKg(lines);

  if (!isRoll) {
    const totalPieces = lines.reduce((sum, line) => sum + line.pieces, 0);
    const totalBoxes = lines.reduce((sum, line) => sum + line.boxes, 0);
    const emptyRows = Array.from({ length: Math.max(0, 25 - lines.length) });

    return (
      <>
        <div className="estimate-title">ESTIMATE</div>

        <table className="estimate-table" style={{ tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td style={{ width: '58%', verticalAlign: 'top', height: 72 }}>
                <strong>To</strong>
                <div style={{ marginTop: 5 }}>{quotation.customerName}</div>
                {quotation.customerAddress && <div>{quotation.customerAddress}</div>}
                <div>Pincode : {customerPincode || '-'}</div>
                <div>Phone : {quotation.customerMobile || '-'}</div>
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <table>
                  <tbody>
                    <tr>
                      <td><strong>Order No</strong></td>
                      <td>: {quotation.quotationNumber}</td>
                    </tr>
                    <tr>
                      <td><strong>Order Date</strong></td>
                      <td>: {date(quotation.quotationDate)}</td>
                    </tr>
                    <tr>
                      <td><strong>SalesMan</strong></td>
                      <td>: {quotation.salesmanName || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="estimate-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: 22 }}>#</th>
              <th style={{ width: 48 }}>Size</th>
              <th>Description</th>
              <th className="num" style={{ width: 42 }}>BOX</th>
              <th className="num" style={{ width: 38 }}>PCS</th>
              <th className="num" style={{ width: 60 }}>Rate</th>
              <th className="num" style={{ width: 72 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                <td style={{ textAlign: 'center' }}>{line.sizeMm || line.baseUom}</td>
                <td>{line.productName}</td>
                <td className="num">{line.boxes}</td>
                <td className="num">{line.pieces}</td>
                <td className="num">{money(rateIncludingGst(line))}</td>
                <td className="num">{money(line.lineTotal)}</td>
              </tr>
            ))}
            {emptyRows.map((_, index) => (
              <tr key={`empty-${index}`} aria-hidden="true" style={{ height: 17 }}>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <strong>Total Items : {lines.length}</strong>
              </td>
              <td className="num"><strong>{totalBoxes}</strong></td>
              <td className="num"><strong>{totalPieces}</strong></td>
              <td className="num"><strong>TOTAL</strong></td>
              <td className="num"><strong>{money(lines.reduce((sum, line) => sum + line.lineTotal, 0))}</strong></td>
            </tr>
          </tbody>
        </table>

        <table className="estimate-table" style={{ tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td style={{ width: '52%', verticalAlign: 'top' }}>
                <strong>Terms and Conditions :</strong>
                {terms.map((term) => (
                  <div key={term} style={{ marginTop: 3 }}>* {term}</div>
                ))}
                {quotation.remarks && (
                  <div style={{ marginTop: 8 }}><strong>Remarks:</strong> {quotation.remarks}</div>
                )}
              </td>
              <td style={{ padding: 0, verticalAlign: 'top' }}>
                <table>
                  <tbody>
                    <tr><td>ADD : AUTO FREIGHT</td><td className="num">{money(quotation.freightCharge)}</td></tr>
                    <tr><td>ADD : UNLOADING</td><td className="num">{money(quotation.unloadingCharge)}</td></tr>
                    <tr><td>ADD : LOADING CHARGE</td><td className="num">{money(quotation.loadingCharge)}</td></tr>
                    <tr><td>ADD/LESS : Round Off</td><td className="num">{money(quotation.roundOff)}</td></tr>
                    <tr>
                      <td><strong>NET AMOUNT</strong></td>
                      <td className="num"><strong>{money(quotation.grandTotal)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 5 }}><strong>Total product weight: {weight(totalWeight)} kg</strong></div>

      </>
    );
  }

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <PrintLogo />
        <div className="title">{company.name}</div>
        {branch.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div>
          {[branch.phone, branch.email].filter(Boolean).join('  ·  ')}
        </div>
        {(branch.gstin ?? company.gstin) && <div>GSTIN {branch.gstin ?? company.gstin}</div>}
      </div>

      <div className="rule doc-title">QUOTATION</div>

      <div>
          <div>
            <strong>No:</strong> {quotation.quotationNumber}
          </div>
          <div>
            <strong>Date:</strong> {date(quotation.quotationDate)}
            {quotation.validUntil ? `   Valid: ${date(quotation.validUntil)}` : ''}
          </div>
          <div className="rule" />
          <div>
            <strong>{quotation.customerName}</strong>
          </div>
          {quotation.customerAddress && <div>{quotation.customerAddress}</div>}
          <div>Pincode: {customerPincode || '-'}</div>
          {quotation.customerMobile && <div>Mob: {quotation.customerMobile}</div>}
      </div>

      <table className="print-item-grid" style={{ marginTop: isRoll ? 2 : 8 }}>
        <thead>
          <tr className="rule">
            <th style={{ textAlign: 'left' }}>Item</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) =>
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
                        <td className="num">x {money(rateIncludingGst(line))}</td>
                        <td className="num">
                          <strong>{money(line.lineTotal)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>,
          )}
        </tbody>
      </table>

      <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
        <tbody>
          <tr>
              <td className="muted">Sub total</td>
              <td className="num">{money(quotation.subTotal)}</td>
          </tr>
          <tr>
            <td className="muted">GST</td>
            <td className="num">{money(quotation.gstAmount)}</td>
          </tr>
          {charges > 0 && (
            <tr>
              <td className="muted">Freight &amp; handling</td>
              <td className="num">{money(charges)}</td>
            </tr>
          )}
          {quotation.roundOff !== 0 && (
            <tr>
              <td className="muted">Round off</td>
              <td className="num">{money(quotation.roundOff)}</td>
            </tr>
          )}
          <tr className="rule">
            <td>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{money(quotation.grandTotal)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="rule" style={{ marginTop: 2 }}>
        <strong>Total product weight: {weight(totalWeight)} kg</strong>
      </div>

      <div style={{ marginTop: 2 }}>
          <div className="rule" />
          <div>{amountInWords(quotation.grandTotal)}</div>
          {quotation.salesmanName && <div>Salesman: {quotation.salesmanName}</div>}
      </div>

      {terms.length > 0 && (
        <div className="terms" style={{ marginTop: isRoll ? 4 : 10 }}>
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

      <div style={{ marginTop: 6, textAlign: 'center' }}>
        <div>Thank you for your enquiry</div>
      </div>
    </>
  );
}
