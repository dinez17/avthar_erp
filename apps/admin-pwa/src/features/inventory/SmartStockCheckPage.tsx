import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { splitBoxesPieces } from '@tiles-erp/shared';
import { PageContainer } from '@tiles-erp/ui';
import { useSessionBranchId } from '../../lib/session-branch';
import { useBranches } from '../products/branch-prices-api';
import { useGodowns, useSmartStockCheck, useVerifySmartStock } from './api';

const relativeTime = (value: string | null): string => {
  if (!value) return 'Never checked';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} day(s) ago`;
};

export function SmartStockCheckPage(): JSX.Element {
  const branches = useBranches();
  const [branchId, setBranchId] = useSessionBranchId();
  const godowns = useGodowns(branchId || undefined);
  const [godownId, setGodownId] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [mode, setMode] = useState('PRIORITY');
  const [search, setSearch] = useState('');
  const queue = useSmartStockCheck(branchId, godownId, intervalMinutes, mode, search);
  const verify = useVerifySmartStock();
  const [counts, setCounts] = useState<Record<string, { boxes: string; pieces: string }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setGodownId(''); }, [branchId]);
  const items = queue.data?.items ?? [];
  const checkedToday = useMemo(() => items.filter((row) => row.lastCheckedAt
    && new Date(row.lastCheckedAt).toDateString() === new Date().toDateString()).length, [items]);

  const submit = async (productId: string): Promise<void> => {
    const count = counts[productId];
    if (!count || (count.boxes.trim() === '' && count.pieces.trim() === '')) {
      setError('Enter the physical quantity before marking the product checked.');
      return;
    }
    setError(null); setMessage(null);
    try {
      const result = await verify.mutateAsync({
        branchId, godownId, productId,
        boxes: Number(count.boxes || 0), pieces: Number(count.pieces || 0),
      });
      setCounts((old) => { const next = { ...old }; delete next[productId]; return next; });
      setMessage(result.adjusted
        ? `Check saved and stock adjusted by ${result.differenceBoxes.toFixed(3)} box.`
        : 'Check saved. Physical stock matches ERP stock.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the stock check.');
    }
  };

  return (
    <PageContainer title="Smart stock check" subtitle="A short live queue for recurring showroom stock verification.">
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
        <Card variant="outlined"><CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField select label="Branch" size="small" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ minWidth: 220 }}>
              {(branches.data ?? []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
            </TextField>
            <TextField select label="Showroom / godown" size="small" value={godownId} onChange={(e) => setGodownId(e.target.value)} sx={{ minWidth: 220 }} disabled={!branchId}>
              {(godowns.data ?? []).map((godown) => <MenuItem key={godown.id} value={godown.id}>{godown.name}</MenuItem>)}
            </TextField>
            <TextField select label="Recheck after" size="small" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} sx={{ minWidth: 150 }}>
              <MenuItem value={30}>30 minutes</MenuItem><MenuItem value={60}>1 hour</MenuItem><MenuItem value={120}>2 hours</MenuItem><MenuItem value={480}>8 hours</MenuItem>
            </TextField>
            <TextField select label="Queue" size="small" value={mode} onChange={(e) => setMode(e.target.value)} sx={{ minWidth: 150 }}>
              <MenuItem value="PRIORITY">Smart priority</MenuItem><MenuItem value="RECENT">Recently moved</MenuItem><MenuItem value="RANDOM">Random sample</MenuItem>
            </TextField>
            <TextField label="Search product" size="small" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button startIcon={<RefreshIcon />} onClick={() => void queue.refetch()}>Refresh</Button>
          </Stack>
        </CardContent></Card>

        {godownId && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip color="warning" label={`${queue.data?.dueProducts ?? 0} due`} />
          <Chip label={`${queue.data?.totalProducts ?? 0} stocked products`} />
          <Chip color="success" variant="outlined" label={`${checkedToday} in current queue checked today`} />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>Queue refreshes every 30 seconds.</Typography>
        </Stack>}

        {!godownId ? <Alert severity="info">Select the showroom or godown to begin.</Alert> : items.length === 0
          ? <Alert severity="success">No stocked products match this selection.</Alert>
          : <Stack spacing={1.5}>{items.map((row, index) => {
              const current = splitBoxesPieces(row.bookQtyBoxes, row.piecesPerBox);
              const count = counts[row.productId] ?? { boxes: '', pieces: '' };
              const pieceOnly = row.baseUom === 'PIECE' || row.piecesPerBox === 1;
              return <Card key={row.productId} variant="outlined" sx={{ borderColor: row.due ? 'warning.light' : 'divider' }}><CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={`#${index + 1}`} /><Typography fontWeight={700}>{row.sku} · {row.productName}</Typography></Stack>
                    <Typography variant="body2" color="text.secondary">{row.brandName}{row.sizeMm ? ` · ${row.sizeMm}` : ''}</Typography>
                    <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={row.due ? 'warning' : 'success'} label={relativeTime(row.lastCheckedAt)} />
                      {row.lastMovementAt && <Chip size="small" variant="outlined" label={`Moved ${relativeTime(row.lastMovementAt)}`} />}
                      <Chip size="small" variant="outlined" label={pieceOnly ? `ERP: ${Math.round(row.bookQtyBoxes)} pcs` : `ERP: ${current.boxes} box ${current.pieces} pcs`} />
                    </Stack>
                  </Box>
                  <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { md: 390 } }}>
                    {!pieceOnly && <TextField type="number" label="Actual boxes" size="small" value={count.boxes} onChange={(e) => setCounts((old) => ({ ...old, [row.productId]: { ...count, boxes: e.target.value } }))} inputProps={{ min: 0 }} sx={{ width: 125 }} />}
                    <TextField type="number" label="Actual pieces" size="small" value={count.pieces} onChange={(e) => setCounts((old) => ({ ...old, [row.productId]: { ...count, pieces: e.target.value } }))} inputProps={{ min: 0 }} sx={{ width: 125 }} />
                    <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={verify.isPending} onClick={() => void submit(row.productId)}>Save check</Button>
                  </Stack>
                </Stack>
              </CardContent></Card>;
            })}</Stack>}
      </Stack>
    </PageContainer>
  );
}
