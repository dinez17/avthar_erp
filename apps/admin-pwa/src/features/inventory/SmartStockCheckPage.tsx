import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { splitBoxesPieces } from '@tiles-erp/shared';
import { PageContainer } from '@tiles-erp/ui';
import { useSessionBranchId } from '../../lib/session-branch';
import { useBranches } from '../products/branch-prices-api';
import { useSmartStockCheck, useVerifySmartStock } from './api';

const relativeTime = (value: string | null): string => {
  if (!value) return 'Never';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} day(s) ago`;
};

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function SmartStockCheckPage(): JSX.Element {
  const branches = useBranches();
  const [branchId, setBranchId] = useSessionBranchId();
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [mode, setMode] = useState('PRIORITY');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [billedDate, setBilledDate] = useState(today);
  const queue = useSmartStockCheck(branchId, intervalMinutes, mode, search, limit, billedDate);
  const confirm = useVerifySmartStock();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = queue.data?.items ?? [];

  const markUpdated = async (productId: string): Promise<void> => {
    setError(null); setMessage(null);
    try {
      await confirm.mutateAsync({ branchId, productId });
      setMessage('Display board update recorded. ERP stock was not changed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to record the display update.');
    }
  };

  return <PageContainer title="Showroom stock display" subtitle="Copy current branch stock to the display board, then mark it updated.">
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Alert severity="info">This page never changes ERP stock. It totals stock across all active godowns in the selected branch.</Alert>
      <Card variant="outlined"><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField select label="Branch" size="small" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ minWidth: 240 }}>
            {(branches.data ?? []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
          </TextField>
          <TextField select label="Show again after" size="small" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} sx={{ minWidth: 170 }}>
            <MenuItem value={30}>30 minutes</MenuItem><MenuItem value={60}>1 hour</MenuItem><MenuItem value={120}>2 hours</MenuItem><MenuItem value={480}>8 hours</MenuItem>
          </TextField>
          <TextField select label="Products" size="small" value={mode} onChange={(e) => setMode(e.target.value)} sx={{ minWidth: 190 }}>
            <MenuItem value="PRIORITY">Needs display update</MenuItem><MenuItem value="RECENT">Recently billed / moved</MenuItem><MenuItem value="RANDOM">Random review</MenuItem>
            <MenuItem value="BILLED">Billed on selected date</MenuItem>
          </TextField>
          {mode === 'BILLED' && <TextField type="date" label="Billed date" size="small" value={billedDate} onChange={(e) => setBilledDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
          <TextField label="Search product" size="small" value={search} onChange={(e) => setSearch(e.target.value)} />
          <TextField select label="Show" size="small" value={limit} onChange={(e) => setLimit(Number(e.target.value))} sx={{ minWidth: 110 }}>
            <MenuItem value={50}>50</MenuItem><MenuItem value={100}>100</MenuItem><MenuItem value={200}>200</MenuItem><MenuItem value={500}>500</MenuItem>
          </TextField>
          <Button startIcon={<RefreshIcon />} onClick={() => void queue.refetch()}>Refresh</Button>
        </Stack>
      </CardContent></Card>
      {branchId && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip color="warning" label={`${queue.data?.dueProducts ?? 0} need update`} />
        <Chip label={`${queue.data?.totalProducts ?? 0} branch products`} />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>Live stock refreshes every 30 seconds.</Typography>
      </Stack>}
      {!branchId ? <Alert severity="info">Select a branch to view current available stock.</Alert>
        : items.length === 0 ? <Alert severity="success">No products match this selection.</Alert>
        : <Stack spacing={1.5}>{items.map((row, index) => {
          const quantity = splitBoxesPieces(row.bookQtyBoxes, row.piecesPerBox);
          const pieceOnly = row.baseUom === 'PIECE' || row.piecesPerBox === 1;
          return <Card key={row.productId} variant="outlined" sx={{ borderColor: row.due ? 'warning.main' : 'divider' }}><CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={`#${index + 1}`} /><Typography fontWeight={800}>{row.sku} · {row.productName}</Typography></Stack>
                <Typography variant="body2" color="text.secondary">{row.brandName}{row.sizeMm ? ` · ${row.sizeMm}` : ''}</Typography>
                <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color={row.due ? 'warning' : 'success'} label={row.lastCheckedAt ? `Board updated ${relativeTime(row.lastCheckedAt)}` : 'Board update not recorded'} />
                  {row.lastMovementAt && <Chip size="small" variant="outlined" label={`Stock changed ${relativeTime(row.lastMovementAt)}`} />}
                  {row.lastBilledAt && <Chip size="small" variant="outlined" color="primary" label={`Billed ${relativeTime(row.lastBilledAt)}`} />}
                </Stack>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, minWidth: 210 }}>
                <Typography variant="caption" color="text.secondary">CURRENT BRANCH STOCK</Typography>
                <Typography variant="h4" fontWeight={900} color="primary.main">
                  {pieceOnly ? `${Math.round(row.bookQtyBoxes)} pcs` : `${quantity.boxes} box ${quantity.pieces} pcs`}
                </Typography>
              </Box>
              <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={confirm.isPending} onClick={() => void markUpdated(row.productId)} sx={{ minHeight: 48 }}>
                Display updated
              </Button>
            </Stack>
          </CardContent></Card>;
        })}</Stack>}
      <Typography variant="caption" color="text.secondary">Products changed after their last display update appear first.</Typography>
    </Stack>
  </PageContainer>;
}
