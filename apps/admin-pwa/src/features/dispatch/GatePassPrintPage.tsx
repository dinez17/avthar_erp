import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import { Alert, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatBoxPieces } from '@tiles-erp/shared';
import type { GatePassPrintData } from '@tiles-erp/shared-types';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useGatePassPrint } from './gate-pass-api';

/** A4 for the file copy and the driver's; the rolls for a quick security-desk slip. */
type PaperSize = 'A4' | '80mm' | '58mm';

const PAPER_LABELS: Record<PaperSize, string> = {
  A4: 'A4',
  '80mm': '80 mm roll',
  '58mm': '58 mm roll',
};

const isPaperSize = (value: string | null): value is PaperSize =>
  value !== null && value in PAPER_LABELS;

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pageStyle = (paper: PaperSize): string =>
  paper === 'A4'
    ? '@page { size: A4 portrait; margin: 12mm 10mm; }'
    : `@page { size: ${paper === '80mm' ? '80mm' : '58mm'} auto; margin: 3mm; }`;

/**
 * The paper the driver carries and the gate keeps.
 *
 * It is deliberately quantity-only: no rates, no invoice value. A gate pass travels with
 * the goods and is handed to whoever asks for it, and what a load is worth is not their
 * business.
 */
export function GatePassPrintPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('paper');
  const [paper, setPaper] = useState<PaperSize>(isPaperSize(requested) ? requested : 'A4');
  const { data, isLoading, isError } = useGatePassPrint(id ?? null);

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
        <Alert severity="error">That gate pass could not be loaded.</Alert>
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
          onClick={() => navigate('/gate-passes')}
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
        .gp-sheet {
          width: ${sheetWidth};
          margin: 12px auto;
          background: #fff;
          color: #000;
          font-family: ${isRoll ? "'Courier New', monospace" : "'Helvetica Neue', Arial, sans-serif"};
          font-size: ${isRoll ? (paper === '58mm' ? '10px' : '11px') : '12px'};
          line-height: 1.35;
          padding: ${isRoll ? '4px' : '0'};
        }
        .gp-sheet table { width: 100%; border-collapse: collapse; }
        .gp-sheet th, .gp-sheet td { padding: ${isRoll ? '1px 0' : '4px 6px'}; }
        .gp-sheet .rule { border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000; }
        .gp-sheet .num { text-align: right; white-space: nowrap; }
        .gp-sheet .muted { color: ${isRoll ? '#000' : '#555'}; }
        .gp-sheet .title { font-weight: 700; font-size: ${isRoll ? '13px' : '18px'}; }
        .gp-sheet .drop {
          font-weight: 700;
          border-top: 1px ${isRoll ? 'dashed' : 'solid'} #000;
          padding-top: ${isRoll ? '2px' : '5px'};
        }
        .gp-sheet .doc-title {
          text-align: center;
          font-weight: 700;
          letter-spacing: 1px;
          padding: ${isRoll ? '2px 0' : '6px 0'};
        }
        .gp-sheet .sign {
          margin-top: ${isRoll ? '18px' : '34px'};
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .gp-sheet .sign div {
          border-top: 1px solid #000;
          padding-top: 3px;
          flex: 1;
          text-align: center;
        }
        @media print {
          body * { visibility: hidden !important; }
          .gp-sheet, .gp-sheet * { visibility: visible !important; }
          .print-hidden, .print-hidden * { display: none !important; }
          .gp-sheet {
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

      <Box className="gp-sheet">
        <PrintBody data={data} isRoll={isRoll} />
      </Box>
    </Box>
  );
}

function PrintBody({ data, isRoll }: { data: GatePassPrintData; isRoll: boolean }): JSX.Element {
  const { gatePass, company, branch } = data;
  const lines = gatePass.lines ?? [];
  const documents = gatePass.documents ?? [];

  /** One block per document, plus a trailing block for anything on no document. */
  const drops = [
    ...documents.map((document, index) => ({
      id: document.id,
      label: [
        `Drop ${document.sequence || index + 1}`,
        document.customerName,
        document.documentNumber,
      ]
        .filter(Boolean)
        .join(' · '),
      address: document.deliveryAddress,
      toCollect: document.freightToCollect,
      lines: lines.filter((line) => line.documentId === document.id),
    })),
    {
      id: 'no-document',
      label: 'No document',
      address: gatePass.destination,
      toCollect: 0,
      lines: lines.filter((line) => line.documentId === null),
    },
  ].filter((drop) => drop.lines.length > 0);

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
        GATE PASS{gatePass.status === 'CANCELLED' ? ' — CANCELLED' : ''}
      </div>

      <table>
        <tbody>
          <tr>
            <td className="muted">No</td>
            <td>
              <strong>{gatePass.gatePassNo}</strong>
            </td>
            {!isRoll && <td className="muted">Date</td>}
            {!isRoll && <td>{date(gatePass.passDate)}</td>}
          </tr>
          {isRoll && (
            <tr>
              <td className="muted">Date</td>
              <td>{date(gatePass.passDate)}</td>
            </tr>
          )}
          <tr>
            <td className="muted">To</td>
            <td colSpan={isRoll ? 1 : 3}>
              <strong>
                {gatePass.customerNames.length > 1
                  ? `${gatePass.customerNames.length} drops — see below`
                  : (gatePass.customerNames[0] ?? gatePass.toBranchName ?? '—')}
              </strong>
            </td>
          </tr>
          {gatePass.destination && (
            <tr>
              <td className="muted">Address</td>
              <td colSpan={isRoll ? 1 : 3}>{gatePass.destination}</td>
            </tr>
          )}
          <tr>
            <td className="muted">Vehicle</td>
            <td>{gatePass.vehicleNumber ?? '—'}</td>
            {!isRoll && <td className="muted">Driver</td>}
            {!isRoll && (
              <td>
                {[gatePass.driverName, gatePass.driverPhone].filter(Boolean).join(' · ') || '—'}
              </td>
            )}
          </tr>
          {isRoll && (
            <tr>
              <td className="muted">Driver</td>
              <td>{gatePass.driverName ?? '—'}</td>
            </tr>
          )}
          {gatePass.transporterName && (
            <tr>
              <td className="muted">Transporter</td>
              <td colSpan={isRoll ? 1 : 3}>{gatePass.transporterName}</td>
            </tr>
          )}
          {documents.length > 0 && gatePass.customerNames.length <= 1 && (
            <tr>
              <td className="muted">Documents</td>
              <td colSpan={isRoll ? 1 : 3}>
                {documents.map((document) => document.documentNumber).join(', ')}
              </td>
            </tr>
          )}
          {gatePass.returnable && (
            <tr>
              <td className="muted">Returnable</td>
              <td colSpan={isRoll ? 1 : 3}>
                Yes
                {gatePass.expectedReturnDate
                  ? ` — expected back by ${date(gatePass.expectedReturnDate)}`
                  : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/*
        Grouped by drop, in the order the driver makes them. On a round the header cannot
        name one destination, so each block carries its own customer and address — that is
        the sheet the driver actually works from.
      */}
      <table className="rule" style={{ marginTop: isRoll ? 2 : 6 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>#</th>
            <th style={{ textAlign: 'left' }}>Product</th>
            {!isRoll && <th style={{ textAlign: 'left' }}>Batch / shade</th>}
            <th className="num">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {drops.map((drop) => (
            <Fragment key={drop.id}>
              <tr>
                <td className="drop" colSpan={isRoll ? 3 : 4}>
                  {drop.label}
                  {drop.address ? ` — ${drop.address}` : ''}
                </td>
              </tr>
              {drop.lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td>
                    {line.productName}
                    {isRoll && line.batchNo ? ` (${line.batchNo})` : ''}
                  </td>
                  {!isRoll && (
                    <td>{[line.batchNo, line.shade].filter(Boolean).join(' / ') || '—'}</td>
                  )}
                  <td className="num">
                    {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                  </td>
                </tr>
              ))}
              {/* What the driver asks for at this door, if anything. */}
              {drop.toCollect > 0 && (
                <tr>
                  <td colSpan={isRoll ? 2 : 3}>
                    <strong>Freight to collect</strong>
                  </td>
                  <td className="num">
                    <strong>{money(drop.toCollect)}</strong>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          <tr className="rule">
            <td colSpan={isRoll ? 2 : 3}>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{gatePass.totalBoxes} boxes</strong>
            </td>
          </tr>
          {gatePass.freightToCollect > 0 && (
            <tr>
              <td colSpan={isRoll ? 2 : 3}>
                <strong>Total freight to collect</strong>
              </td>
              <td className="num">
                <strong>{money(gatePass.freightToCollect)}</strong>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {gatePass.remarks && (
        <div style={{ marginTop: isRoll ? 4 : 8 }}>
          <span className="muted">Remarks: </span>
          {gatePass.remarks}
        </div>
      )}

      {/* The hire is between us and the transporter, so it is printed only on the A4 copy. */}
      {!isRoll && gatePass.hireCharge > 0 && (
        <div style={{ marginTop: 8 }}>
          <span className="muted">Freight: </span>
          hire {money(gatePass.hireCharge)}
          {gatePass.advancePaid > 0
            ? `, advance ${money(gatePass.advancePaid)}, balance ${money(
                gatePass.hireCharge - gatePass.advancePaid,
              )}`
            : ''}
        </div>
      )}

      <div className="sign">
        <div>Prepared by</div>
        <div>Security</div>
        <div>Driver</div>
        <div>Received by</div>
      </div>
    </>
  );
}
