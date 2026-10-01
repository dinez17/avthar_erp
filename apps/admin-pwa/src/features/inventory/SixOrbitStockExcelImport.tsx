import { ChangeEvent, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { apiFetch } from '../../lib/api-client';

interface Result {
  id: string;
  status: string;
  fileName: string;
  products: number;
  matched: number;
  skipped: number;
  adjustments: number;
  unchanged: number;
  locations: { warehouse: string; branch: string; godown: string }[];
  issues: { itemId: string; product: string; warehouse: string; reason: string }[];
}

export function SixOrbitStockExcelImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: 'preview' | 'apply') => {
      if (action === 'apply') return apiFetch<Result>(`/sixorbit/inventory/excel/${result!.id}/apply`, { method: 'POST' });
      if (!file) throw new Error('Choose a SixOrbit Variations Export file.');
      const form = new FormData();
      form.append('file', file);
      return apiFetch<Result>('/sixorbit/inventory/excel/preview', { method: 'POST', body: form });
    },
    onSuccess: async data => {
      setResult(data);
      if (data.status === 'APPLIED') await queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: value => setError(value instanceof Error ? value.message : 'Excel stock import failed'),
  });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected); setResult(null); setError('');
  };
  const run = (action: 'preview' | 'apply') => { setError(''); mutation.mutate(action); };
  const close = () => { if (!mutation.isPending) setOpen(false); };
  return <>
    <input ref={inputRef} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
    <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpen(true)}>Import Excel</Button>
    <Dialog open={open} onClose={close} maxWidth="lg" fullWidth fullScreen={false}>
      <DialogTitle>Import SixOrbit stock from Excel</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">Upload the SixOrbit <strong>Variations Export</strong>. The eight warehouse total columns map to ERP branches; each following column maps to a godown under that branch. The preview reconciles the individual godown quantities. Unmatched products, branches, or godowns are skipped and listed before you apply.</Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Button variant="outlined" disabled={mutation.isPending} onClick={() => inputRef.current?.click()}>Choose .xlsx file</Button>
            <Typography variant="body2">{file?.name ?? 'No file selected'}</Typography>
          </Stack>
          {mutation.isPending && <Alert severity="info" icon={<CircularProgress size={20} />}>{mutation.variables === 'apply' ? 'Applying branch stock…' : 'Reading workbook and comparing ERP stock…'}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {result && <>
            <Alert severity={result.status === 'APPLIED' ? 'success' : 'info'}>
              {result.status === 'APPLIED' ? 'Applied' : 'Preview'}: {result.products} products, {result.matched} godown stock rows matched, {result.adjustments} changes, {result.unchanged} unchanged, {result.skipped} skipped.
            </Alert>
            <Typography variant="subtitle2">Warehouse mapping</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Excel warehouse</TableCell><TableCell>ERP branch</TableCell><TableCell>Adjustment godown</TableCell></TableRow></TableHead><TableBody>
              {result.locations.map(location => <TableRow key={location.warehouse}><TableCell>{location.warehouse}</TableCell><TableCell>{location.branch}</TableCell><TableCell>{location.godown}</TableCell></TableRow>)}
            </TableBody></Table>
            {result.issues.length > 0 && <>
              <Alert severity="warning">{result.skipped} entries need review. They will not change stock.</Alert>
              <Button onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(result.issues, null, 2)], { type: 'application/json' }));
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sixorbit-excel-stock-issues.json'; anchor.click(); URL.revokeObjectURL(url);
              }}>Download skipped entries</Button>
              {result.issues.slice(0, 100).map((issue, index) => <Typography key={`${issue.itemId}-${issue.warehouse}-${index}`} variant="body2">{issue.product || issue.itemId || 'Warehouse mapping'}{issue.warehouse ? ` — ${issue.warehouse}` : ''}: {issue.reason}</Typography>)}
            </>}
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={mutation.isPending} onClick={close}>Close</Button>
        <Button disabled={mutation.isPending || !file} onClick={() => run('preview')}>Preview import</Button>
        <Button variant="contained" disabled={mutation.isPending || !result || result.status === 'APPLIED' || !result.matched} onClick={() => run('apply')}>Apply stock</Button>
      </DialogActions>
    </Dialog>
  </>;
}
