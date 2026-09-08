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

/** A4 for the office copy, 80mm and 58mm for the counter roll printers. */
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

/** Prints the quantity as it was entered: "10 box 2 pcs", or "12 pcs" for loose goods. */
const quantity = (line: QuotationLineItem): string => {
  if (line.boxes <= 0) return `${line.pieces} pcs`;
  return line.pieces > 0 ? `${line.boxes} box ${line.pieces} pcs` : `${line.boxes} box`;
};

/**
 * Page rules per paper size. Roll printers have no margins to speak of and a fixed
 * width, so the sheet is sized in millimetres and the height left to the content.
 */
const pageStyle = (paper: PaperSize): string => {
  if (paper === 'A4') {
    return `@page { size: A4 portrait; margin: 12mm 10mm; }`;
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
  const [paper, setPaper] = useState<PaperSize>(isPaperSize(requested) ? requested : 'A4');
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
          font-size: ${isRoll ? (paper === '58mm' ? '10px' : '11px') : '12px'};
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

/** The document itself. The same content sets in one column on a roll, two on A4. */
function PrintBody({ data, isRoll }: { data: QuotationPrintData; isRoll: boolean }): JSX.Element {
  const { quotation, company, branch, terms } = data;
  const lines = quotation.lines ?? [];
  const charges =
    quotation.freightCharge + quotation.unloadingCharge + quotation.loadingCharge;

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

      {isRoll ? (
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
          {quotation.customerMobile && <div>Mob: {quotation.customerMobile}</div>}
        </div>
      ) : (
        <table>
          <tbody>
            <tr>
              <td style={{ width: '55%', verticalAlign: 'top' }}>
                <div className="muted">Quotation to</div>
                <div>
                  <strong>{quotation.customerName}</strong>
                </div>
                {quotation.customerAddress && <div>{quotation.customerAddress}</div>}
                {quotation.customerMobile && <div>Mobile: {quotation.customerMobile}</div>}
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <table>
                  <tbody>
                    <tr>
                      <td className="muted">Quotation no</td>
                      <td>
                        <strong>{quotation.quotationNumber}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Date</td>
                      <td>{date(quotation.quotationDate)}</td>
                    </tr>
                    {quotation.validUntil && (
                      <tr>
                        <td className="muted">Valid until</td>
                        <td>{date(quotation.validUntil)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="muted">Branch</td>
                      <td>{quotation.branchName}</td>
                    </tr>
                    {quotation.salesmanName && (
                      <tr>
                        <td className="muted">Salesman</td>
                        <td>{quotation.salesmanName}</td>
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
            {!isRoll && <th style={{ width: 28, textAlign: 'left' }}>#</th>}
            <th style={{ textAlign: 'left' }}>Item</th>
            {!isRoll && <th className="num" style={{ width: 110 }}>Qty</th>}
            {!isRoll && <th className="num" style={{ width: 90 }}>Rate</th>}
            {!isRoll && <th className="num" style={{ width: 100 }}>Amount</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) =>
            isRoll ? (
              // A roll is too narrow for columns: name on its own line, figures below.
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
                </td>
                <td className="num">{quantity(line)}</td>
                <td className="num">{money(line.rate)}</td>
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
              <td rowSpan={6} style={{ verticalAlign: 'top', width: '55%' }}>
                <div className="muted">Amount in words</div>
                <div>
                  <strong>{amountInWords(quotation.grandTotal)}</strong>
                </div>
                {quotation.remarks && (
                  <div style={{ marginTop: 6 }}>
                    <span className="muted">Remarks: </span>
                    {quotation.remarks}
                  </div>
                )}
              </td>
              <td className="muted">Sub total</td>
              <td className="num">{money(quotation.subTotal)}</td>
            </tr>
          )}
          {isRoll && (
            <tr>
              <td className="muted">Sub total</td>
              <td className="num">{money(quotation.subTotal)}</td>
            </tr>
          )}
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

      {isRoll && (
        <div style={{ marginTop: 2 }}>
          <div className="rule" />
          <div>{amountInWords(quotation.grandTotal)}</div>
          {quotation.salesmanName && <div>Salesman: {quotation.salesmanName}</div>}
        </div>
      )}

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

      <div style={{ marginTop: isRoll ? 6 : 24, textAlign: isRoll ? 'center' : 'right' }}>
        {isRoll ? (
          <div>Thank you for your enquiry</div>
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
