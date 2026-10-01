import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, Stack } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { amountInWords, formatBoxPieces } from '@tiles-erp/shared';
import { LoadingOverlay } from '@tiles-erp/ui';
import { PrintLogo } from '../../app/branding';
import { useSalesReturn } from './invoices-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SalesReturnPrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const result = useSalesReturn(id ?? null);

  if (result.isLoading) return <LoadingOverlay open />;
  if (result.isError || !result.data) {
    return <Box sx={{ p: 2 }}><Alert severity="error">That sales return could not be loaded.</Alert></Box>;
  }

  const returned = result.data;
  return (
    <Box>
      <Stack
        className="print-hidden"
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Button color="inherit" startIcon={<ArrowBackIcon />} onClick={() => navigate('/sales-returns')}>
          Back
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print
        </Button>
      </Stack>

      <style>{`
        @page { size: A4 portrait; margin: 12mm 10mm; }
        .return-sheet { width: 190mm; margin: 12px auto; background: #fff; color: #000;
          font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.35; }
        .return-sheet table { width: 100%; border-collapse: collapse; }
        .return-sheet th, .return-sheet td { border: 1px solid #222; padding: 5px 6px; }
        .return-sheet th { background: #f2f2f2; text-align: left; }
        .return-sheet .num { text-align: right; white-space: nowrap; }
        .return-sheet .title { text-align: center; font-size: 18px; font-weight: 700; }
        .return-sheet .document-title { margin: 8px 0; border: 1px solid #222; padding: 6px;
          text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .5px; }
        .return-sheet .meta { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #222;
          border-bottom: 0; }
        .return-sheet .meta > div { padding: 5px 7px; border-right: 1px solid #222; }
        .return-sheet .meta > div:nth-child(even) { border-right: 0; }
        @media print {
          body * { visibility: hidden !important; }
          .return-sheet, .return-sheet * { visibility: visible !important; }
          .print-hidden, .print-hidden * { display: none !important; }
          .return-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; }
          body { background: #fff; }
        }
      `}</style>

      <Box className="return-sheet">
        <Box sx={{ textAlign: 'center' }}>
          <PrintLogo />
          <div className="title">{returned.branchName}</div>
        </Box>
        <div className="document-title">SALES RETURN / CREDIT NOTE</div>
        <div className="meta">
          <div><strong>Return No:</strong> {returned.returnNumber}</div>
          <div><strong>Return Date:</strong> {new Date(returned.returnDate).toLocaleDateString('en-IN')}</div>
          <div><strong>Customer:</strong> {returned.customerName}</div>
          <div><strong>Against Invoice:</strong> {returned.invoiceNumber}</div>
          <div style={{ gridColumn: '1 / -1', borderRight: 0 }}><strong>Reason:</strong> {returned.reason}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th><th>Item</th><th>Godown</th><th>Returned</th>
              <th className="num">Rate</th><th className="num">GST</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {(returned.lines ?? []).map((line, index) => (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td>{line.productName}{line.sizeMm ? ` · ${line.sizeMm}` : ''}<br /><small>{line.sku}</small></td>
                <td>{line.godownName}</td>
                <td>{formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}</td>
                <td className="num">{money(line.rate)}</td>
                <td className="num">{money(line.lineGst)}</td>
                <td className="num">{money(line.lineTotal)}</td>
              </tr>
            ))}
            <tr><td colSpan={6} className="num"><strong>Sub total</strong></td><td className="num">{money(returned.subTotal)}</td></tr>
            <tr><td colSpan={6} className="num"><strong>GST</strong></td><td className="num">{money(returned.gstAmount)}</td></tr>
            <tr><td colSpan={6} className="num"><strong>Total return value</strong></td><td className="num"><strong>{money(returned.grandTotal)}</strong></td></tr>
          </tbody>
        </table>
        <Box sx={{ mt: 1 }}><strong>Amount in words:</strong> {amountInWords(returned.grandTotal)}</Box>
        {returned.remarks && <Box sx={{ mt: 1 }}><strong>Remarks:</strong> {returned.remarks}</Box>}
        <Box sx={{ mt: 7, textAlign: 'right' }}>Authorised signatory</Box>
      </Box>
    </Box>
  );
}
