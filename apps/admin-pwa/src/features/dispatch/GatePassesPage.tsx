import AddIcon from '@mui/icons-material/Add';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PrintIcon from '@mui/icons-material/Print';
import FlagIcon from '@mui/icons-material/Flag';
import PublishIcon from '@mui/icons-material/Publish';
import UndoIcon from '@mui/icons-material/Undo';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { GatePassItem, GatePassStatus, GatePassType } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { GatePassDetailDialog } from './GatePassDetailDialog';
import { DeliveryDialog } from './DeliveryDialog';
import { GateOutDialog } from './GateOutDialog';
import { CloseTripDialog } from './CloseTripDialog';
import {
  useCancelGatePass,
  useDeleteGatePass,
  useGatePasses,
  useReturnGatePass,
  useSetGatePassLoaded,
} from './gate-pass-api';

const STATUS_COLORS: Record<
  GatePassStatus,
  'default' | 'info' | 'warning' | 'success' | 'error' | 'primary'
> = {
  DRAFT: 'default',
  LOADED: 'info',
  GATED_OUT: 'warning',
  DELIVERED: 'success',
  CLOSED: 'primary',
  CANCELLED: 'error',
};

const STATUS_LABELS: Record<GatePassStatus, string> = {
  DRAFT: 'Draft',
  LOADED: 'Loaded',
  GATED_OUT: 'On the road',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const TYPE_LABELS: Record<GatePassType, string> = {
  SALES: 'Sales',
  TRANSFER: 'Transfer',
  SAMPLE: 'Sample',
};

const STATUSES = Object.keys(STATUS_LABELS) as GatePassStatus[];
const TYPES = Object.keys(TYPE_LABELS) as GatePassType[];

const PAPER_SIZES = [
  { value: 'A4', label: 'A4' },
  { value: '80mm', label: '80 mm roll' },
  { value: '58mm', label: '58 mm roll' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Gate passes: what is on the vehicle, whether it has left, and whether it arrived.
 *
 * A pass moves DRAFT → LOADED → GATED_OUT → DELIVERED, and each step is a different
 * person's job, which is why they are separate buttons and separate permissions rather
 * than one Save.
 */
export function GatePassesPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [type, setType] = useState<GatePassType | ''>('');
  const [status, setStatus] = useState<GatePassStatus | ''>('');

  const { data, isFetching } = useGatePasses(pagination.query, {
    branchId: branchId || undefined,
    type: type || undefined,
    status: status || undefined,
  });

  const setLoaded = useSetGatePassLoaded();
  const recordReturn = useReturnGatePass();
  const cancelPass = useCancelGatePass();
  const deletePass = useDeleteGatePass();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [gatingOut, setGatingOut] = useState<GatePassItem | null>(null);
  const [delivering, setDelivering] = useState<GatePassItem | null>(null);
  const [closing, setClosing] = useState<GatePassItem | null>(null);
  const [printMenu, setPrintMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const [cancelling, setCancelling] = useState<GatePassItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleting, setDeleting] = useState<GatePassItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    try {
      await action();
      setNotice(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const submitCancel = (): void => {
    if (!cancelling) return;
    const pass = cancelling;
    void run(async () => {
      await cancelPass.mutateAsync({ id: pass.id, version: pass.version, reason: cancelReason });
      setCancelling(null);
      setCancelReason('');
    }, `${pass.gatePassNo} cancelled; anything it had taken out is back.`);
  };

  const columns = useMemo<ColDef<GatePassItem>[]>(
    () => [
      { field: 'gatePassNo', headerName: 'Gate pass', minWidth: 145 },
      {
        field: 'passDate',
        headerName: 'Date',
        maxWidth: 115,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      {
        field: 'type',
        headerName: 'For',
        maxWidth: 110,
        valueFormatter: (p) => TYPE_LABELS[p.value as GatePassType],
      },
      {
        headerName: 'Going to',
        minWidth: 210,
        cellRenderer: (p: ICellRendererParams<GatePassItem>) => {
          const pass = p.data;
          if (!pass) return null;
          const names = pass.customerNames;
          // A round drops at several, so name the first and count the rest rather than
          // pretending the lorry is going to one place.
          if (names.length > 1) {
            return (
              <Tooltip title={names.join(', ')}>
                <span>
                  {names[0]} <Chip label={`+${names.length - 1}`} size="small" />
                </span>
              </Tooltip>
            );
          }
          return names[0] ?? pass.toBranchName ?? pass.destination ?? '—';
        },
      },
      { field: 'vehicleNumber', headerName: 'Vehicle', minWidth: 130 },
      { field: 'driverName', headerName: 'Driver', minWidth: 140 },
      {
        field: 'totalBoxes',
        headerName: 'Boxes',
        maxWidth: 110,
        valueFormatter: (p) => (p.value as number).toLocaleString('en-IN'),
      },
      {
        headerName: 'Freight',
        maxWidth: 130,
        valueGetter: (p) => p.data?.freightMargin ?? 0,
        cellRenderer: (p: ICellRendererParams<GatePassItem>) => {
          const pass = p.data;
          if (!pass) return null;
          if (pass.hireCharge === 0 && pass.chargedFreight === 0) return '—';
          return (
            <Tooltip
              title={
                `Charged ${money(pass.chargedFreight)} · hire ${money(pass.hireCharge)}` +
                (pass.freightToCollect > 0
                  ? ` · ${money(pass.freightToCollect)} to collect at the door`
                  : '')
              }
            >
              <span style={{ color: pass.freightMargin < 0 ? '#d32f2f' : undefined }}>
                {money(pass.freightMargin)}
              </span>
            </Tooltip>
          );
        },
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 145,
        cellRenderer: (p: ICellRendererParams<GatePassItem>) => {
          const pass = p.data;
          if (!pass) return null;
          return (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip
                label={STATUS_LABELS[pass.status]}
                size="small"
                color={STATUS_COLORS[pass.status]}
              />
              {pass.hasShortLoad && (
                <Tooltip title="Loaded short of what the document says">
                  <Chip label="short" size="small" color="warning" variant="outlined" />
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
      {
        headerName: '',
        minWidth: 260,
        cellRenderer: (p: ICellRendererParams<GatePassItem>) => {
          const pass = p.data;
          if (!pass) return null;
          const isDraft = pass.status === 'DRAFT';
          const canReturn = pass.returnable && !pass.returnedAt && pass.status !== 'DRAFT';
          const canClose = pass.status === 'GATED_OUT' || pass.status === 'DELIVERED';

          return (
            <>
              <Tooltip title="View what is on it">
                <IconButton size="small" onClick={() => setViewingId(pass.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print the gate pass">
                <IconButton
                  size="small"
                  onClick={(event) => setPrintMenu({ anchor: event.currentTarget, id: pass.id })}
                >
                  <PrintIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isDraft ? 'Load checked — ready for the gate' : 'Already checked'}>
                <span>
                  <IconButton
                    size="small"
                    color="info"
                    disabled={!isDraft}
                    onClick={() =>
                      void run(
                        () =>
                          setLoaded.mutateAsync({
                            id: pass.id,
                            version: pass.version,
                            loaded: true,
                          }),
                        `${pass.gatePassNo} checked and waiting at the gate.`,
                      )
                    }
                  >
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={
                  pass.status === 'LOADED'
                    ? 'Let the vehicle out and note the odometer'
                    : 'Only a checked load can go'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={pass.status !== 'LOADED'}
                    onClick={() => setGatingOut(pass)}
                  >
                    <LocalShippingIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={
                  pass.status === 'GATED_OUT' ? 'Record proof of delivery' : 'It has not left yet'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={pass.status !== 'GATED_OUT'}
                    onClick={() => setDelivering(pass)}
                  >
                    <AssignmentTurnedInIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={
                  canClose
                    ? 'Vehicle is back: closing km, collections and cash'
                    : 'The vehicle has not gone out yet'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    disabled={!canClose}
                    onClick={() => setClosing(pass)}
                  >
                    <FlagIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {canReturn && (
                <Tooltip title="Samples came back into stock">
                  <IconButton
                    size="small"
                    onClick={() =>
                      void run(
                        () => recordReturn.mutateAsync({ id: pass.id, version: pass.version }),
                        `${pass.gatePassNo}: samples back in stock.`,
                      )
                    }
                  >
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Cancel this pass">
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={
                      pass.status === 'CANCELLED' ||
                      pass.status === 'DELIVERED' ||
                      pass.status === 'CLOSED'
                    }
                    onClick={() => {
                      setCancelling(pass);
                      setCancelReason('');
                    }}
                  >
                    <CancelIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={isDraft ? 'Delete draft' : 'Only drafts can be deleted'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={!isDraft}
                    onClick={() => setDeleting(pass)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          );
        },
      },
    ],
    [],
  );

  return (
    <PageContainer
      title="Gate passes"
      subtitle="What is on the vehicle, whether it has left, and whether it arrived."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/gate-passes/new')}
        >
          New gate pass
        </Button>
      }
    >
      <Stack spacing={1}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="For"
            size="small"
            fullWidth={false}
            value={type}
            onChange={(e) => {
              setType(e.target.value as GatePassType | '');
              pagination.setPage(1);
            }}
            sx={{ width: 150 }}
          >
            <MenuItem value="">All kinds</MenuItem>
            {TYPES.map((each) => (
              <MenuItem key={each} value={each}>
                {TYPE_LABELS[each]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Status"
            size="small"
            fullWidth={false}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as GatePassStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 165 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {STATUSES.map((each) => (
              <MenuItem key={each} value={each}>
                {STATUS_LABELS[each]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by gate pass, invoice, vehicle or driver…"
          height={580}
        />
      </Stack>

      <Menu
        open={printMenu !== null}
        anchorEl={printMenu?.anchor ?? null}
        onClose={() => setPrintMenu(null)}
      >
        {PAPER_SIZES.map((size) => (
          <MenuItem
            key={size.value}
            onClick={() => {
              const target = printMenu;
              setPrintMenu(null);
              if (target) navigate(`/gate-passes/${target.id}/print?paper=${size.value}`);
            }}
          >
            {size.label}
          </MenuItem>
        ))}
      </Menu>

      <GatePassDetailDialog id={viewingId} onClose={() => setViewingId(null)} />

      <GateOutDialog
        gatePass={gatingOut}
        onClose={() => setGatingOut(null)}
        onGatedOut={(gatePassNo) => {
          setGatingOut(null);
          setNotice(`${gatePassNo} gated out.`);
        }}
      />

      <CloseTripDialog
        gatePass={closing}
        onClose={() => setClosing(null)}
        onClosed={(gatePassNo) => {
          setClosing(null);
          setNotice(`${gatePassNo} closed.`);
        }}
      />

      <DeliveryDialog
        gatePass={delivering}
        onClose={() => setDelivering(null)}
        onDelivered={(gatePassNo) => {
          setDelivering(null);
          setNotice(`${gatePassNo} delivered.`);
        }}
      />

      <Dialog open={cancelling !== null} onClose={() => setCancelling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel {cancelling?.gatePassNo}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {cancelling?.status === 'GATED_OUT' && (
              <Alert severity="warning">
                This vehicle has already left. Cancelling puts the dispatched quantities back on
                the invoices, and any samples back into stock.
              </Alert>
            )}
            <TextField
              label="Reason"
              size="small"
              autoFocus
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Vehicle broke down before leaving"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCancelling(null)}>
            Keep it
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={cancelReason.trim().length < 3}
            onClick={submitCancel}
          >
            Cancel gate pass
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete draft gate pass"
        message={`Delete ${deleting?.gatePassNo}? A draft has not moved anything, so no stock changes.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const pass = deleting;
          setDeleting(null);
          if (pass) {
            void run(() => deletePass.mutateAsync(pass.id), `${pass.gatePassNo} deleted.`);
          }
        }}
      />
    </PageContainer>
  );
}
