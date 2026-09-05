import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { amountInWords } from '@tiles-erp/shared';
import type { ReceiptPrintData } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useReceiptPrint } from './receipts-api';

/** A4 for the file copy, 80mm and 58mm for the counter roll printers. */
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

const pageStyle = (paper: PaperSize): string => {
  if (paper === 'A4') return `@page { size: A4 portrait; margin: 12mm 10mm; }`;
  return `@page { size: ${paper === '80mm' ? '80mm' : '58mm'} auto; margin: 3mm; }`;
};

export function ReceiptPrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('paper');
  // A money receipt is handed over at the counter, so the roll is the common case.
  const [paper, setPaper] = useState<PaperSize>(isPaperSize(requested) ? requested : '80mm');
  const { data, isLoading, isError } = useReceiptPrint(id ?? null);

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
        <Alert severity="error">That receipt could not be loaded.</Alert>
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
          onClick={() => navigate('/collections')}
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
        .rcpt-sheet {
          width: ${sheetWidth};
          margin: 12px auto;
          background: #fff;
          color: #000;
          font-family: ${isRoll ? "'Courier New', monospace" : "'Helvetica Neue', Arial, sans-serif"};
          font-size: ${isRoll ? (paper === '58mm' ? '10px' : '11px') : '12px'};
          line-height: 1.35;
          padding: ${isRoll ? '4px' : '0'};
        }
        .rcpt-sheet table { width: 100%; border-collapse: collapse; }
        .rcpt-sheet th, .rcpt-sheet td { padding: ${isRoll ? '1px 0' : '4px 6px'}; }
        .rcpt-sheet .rule { border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000; }
        .rcpt-sheet .num { text-align: right; white-space: nowrap; }
        .rcpt-sheet .muted { color: ${isRoll ? '#000' : '#555'}; }
        .rcpt-sheet .title { font-weight: 700; font-size: ${isRoll ? '13px' : '18px'}; }
        .rcpt-sheet .doc-title {
          text-align: center;
          font-weight: 700;
          letter-spacing: 1px;
          padding: ${isRoll ? '2px 0' : '6px 0'};
        }
        @media print {
          body * { visibility: hidden !important; }
          .rcpt-sheet, .rcpt-sheet * { visibility: visible !important; }
          .print-hidden, .print-hidden * { display: none !important; }
          .rcpt-sheet {
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

      <Box className="rcpt-sheet">
        <PrintBody data={data} isRoll={isRoll} />
      </Box>
    </Box>
  );
}

/** The money receipt: what was received, how, and against which bills. */
function PrintBody({ data, isRoll }: { data: ReceiptPrintData; isRoll: boolean }): JSX.Element {
  const { receipt, company, branch, balanceAmount } = data;
  const payments = receipt.payments ?? [];
  const allocations = receipt.allocations ?? [];

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <div className="title">{company.legalName ?? company.name}</div>
        {branch.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div>{[branch.phone, branch.email].filter(Boolean).join('  ·  ')}</div>
      </div>

      <div className="rule doc-title">
        RECEIPT{receipt.status === 'CANCELLED' ? ' — CANCELLED' : ''}
      </div>

      <table>
        <tbody>
          <tr>
            <td className="muted">No</td>
            <td>
              <strong>{receipt.receiptNumber}</strong>
            </td>
            {!isRoll && <td className="muted">Date</td>}
            {!isRoll && <td>{date(receipt.receiptDate)}</td>}
          </tr>
          {isRoll && (
            <tr>
              <td className="muted">Date</td>
              <td>{date(receipt.receiptDate)}</td>
            </tr>
          )}
          <tr>
            <td className="muted">Received from</td>
            <td colSpan={isRoll ? 1 : 3}>
              <strong>{receipt.customerName}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Paid by</th>
            {!isRoll && <th style={{ textAlign: 'left' }}>Reference</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                {payment.mode}
                {isRoll && payment.referenceNo ? ` ${payment.referenceNo}` : ''}
              </td>
              {!isRoll && (
                <td>{[payment.referenceNo, payment.bankName].filter(Boolean).join(' · ') || '—'}</td>
              )}
              <td className="num">{money(payment.amount)}</td>
            </tr>
          ))}
          <tr className="rule">
            <td colSpan={isRoll ? 1 : 2}>
              <strong>Total received</strong>
            </td>
            <td className="num">
              <strong>{money(receipt.amount)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: isRoll ? 2 : 6 }}>{amountInWords(receipt.amount)}</div>

      {allocations.length > 0 && (
        <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Against invoice</th>
              {!isRoll && <th style={{ textAlign: 'left' }}>Date</th>}
              <th className="num">Settled</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((allocation) => (
              <tr key={allocation.id}>
                <td>{allocation.invoiceNumber}</td>
                {!isRoll && <td>{date(allocation.invoiceDate)}</td>}
                <td className="num">{money(allocation.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
        <tbody>
          {receipt.onAccountAmount > 0 && (
            <tr>
              <td className="muted">On account</td>
              <td className="num">{money(receipt.onAccountAmount)}</td>
            </tr>
          )}
          <tr>
            <td>
              <strong>Balance outstanding</strong>
            </td>
            <td className="num">
              <strong>{money(balanceAmount)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {receipt.remarks && (
        <div style={{ marginTop: isRoll ? 2 : 6 }}>
          <span className="muted">Remarks: </span>
          {receipt.remarks}
        </div>
      )}

      <div style={{ marginTop: isRoll ? 6 : 24, textAlign: isRoll ? 'center' : 'right' }}>
        {isRoll ? (
          <div>Thank you</div>
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
