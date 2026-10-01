import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { apiFetch } from '../../lib/api-client';
interface Result {
  id: string; status: string; fetched: number; matched: number; skipped: number; adjustments: number; unchanged: number;
  branchesToCreate: number; godownsToCreate: number;
  locations: {warehouse: string; section: string; branch: string; godown: string; createGodown: boolean}[];
  totalsBySourceUnit: {unit: string; stock: string; allocated: string}[];
  issues: {itemId: string; product: string; warehouse: string; section: string; reason: string}[];
}
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function SixOrbitStockSync() {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState('2024-04-01');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (apply: boolean) => apiFetch<Result>(apply ? `/sixorbit/inventory/${result!.id}/apply` : '/sixorbit/inventory/preview', {
      method: 'POST', ...(apply ? {} : {body: JSON.stringify({startDate, endDate: today()})}),
    }),
    onSuccess: async data => {
      setResult(data);
      if (data.status === 'APPLIED') await Promise.all([qc.invalidateQueries({queryKey:['stock']}),qc.invalidateQueries({queryKey:['branches']}),qc.invalidateQueries({queryKey:['/godowns']})]);
    },
    onError: e => setError(e instanceof Error ? e.message : 'Stock sync failed'),
  });
  const run = (apply: boolean) => { setError(''); if (!apply) setResult(null); mutation.mutate(apply); };
  return <>
    <Button variant="outlined" startIcon={<SyncIcon />} onClick={() => setOpen(true)}>Sync SixOrbit stock</Button>
    <Dialog open={open} onClose={() => {if (!mutation.isPending) setOpen(false);}} maxWidth="lg" fullWidth>
      <DialogTitle>SixOrbit stock sync</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        <Alert severity="info">SixOrbit’s inventory report contains company-wide totals. Every matched quantity will be stored in AVTHAR CERAMICS - DGL / MAIN GODOWN; the report’s warehouse and section labels are ignored.</Alert>
        <TextField label="Report start date" type="date" value={startDate} disabled={mutation.isPending} onChange={e=>{setStartDate(e.target.value);setResult(null);}} InputLabelProps={{shrink:true}} />
        {mutation.isPending && <Alert severity="info" icon={<CircularProgress size={20} />}>{mutation.variables ? 'Applying company totals to DGL Main Godown…' : 'Fetching SixOrbit inventory and checking product units…'}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {result && <>
          <Alert severity={result.status==='APPLIED'?'success':'info'}>{result.status==='APPLIED'?'Applied':'Preview'}: {result.fetched} rows; {result.matched} matched; {result.adjustments} adjustments; {result.unchanged} unchanged; {result.skipped} skipped. {result.branchesToCreate} new branches, {result.godownsToCreate} new godowns.</Alert>
          <Typography variant="body2">Allocated stock is retained separately in the sync snapshot; it does not create ERP sales reservations. Products absent from the report keep their existing stock.</Typography>
          <Table size="small"><TableHead><TableRow>{['Warehouse','Section','ERP branch','ERP godown'].map(t=><TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead><TableBody>{result.locations.map(l=><TableRow key={`${l.warehouse}/${l.section}`}><TableCell>{l.warehouse}</TableCell><TableCell>{l.section}</TableCell><TableCell>{l.branch}</TableCell><TableCell>{l.godown}{l.createGodown?' (new)':''}</TableCell></TableRow>)}</TableBody></Table>
          <Typography variant="subtitle2">Matched source quantities (before unit conversion)</Typography>
          <Table size="small"><TableHead><TableRow><TableCell>Unit</TableCell><TableCell>Stock</TableCell><TableCell>Allocated</TableCell></TableRow></TableHead><TableBody>{result.totalsBySourceUnit.map(t=><TableRow key={t.unit}><TableCell>{t.unit}</TableCell><TableCell>{t.stock}</TableCell><TableCell>{t.allocated}</TableCell></TableRow>)}</TableBody></Table>
          {result.issues.length>0 && <><Alert severity="warning">{result.skipped} rows need review. Showing the first 100.</Alert><Button onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result.issues,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sixorbit-stock-issues.json';a.click();URL.revokeObjectURL(url);}}>Download all skipped rows</Button>{result.issues.slice(0,100).map((i,n)=><Typography key={n} variant="body2">{i.product} ({i.itemId}) — {i.warehouse}/{i.section}: {i.reason}</Typography>)}</>}
        </>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={mutation.isPending} onClick={()=>setOpen(false)}>Close</Button><Button disabled={mutation.isPending} onClick={()=>run(false)}>Fetch preview</Button><Button variant="contained" disabled={mutation.isPending||!result||result.status==='APPLIED'||!result.matched} onClick={()=>run(true)}>Apply stock</Button></DialogActions>
    </Dialog>
  </>;
}
