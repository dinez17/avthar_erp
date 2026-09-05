import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import type { BulkOrgNodeEntry } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useBulkCreateOrgNodes, useOrgOptions } from './api';
import type { OrgEntityConfig } from './config';

type Mode = 'range' | 'lines';

const MAX_ITEMS = 200;

interface BulkCreateDialogProps {
  open: boolean;
  onClose: () => void;
  config: OrgEntityConfig;
}

function generateRange(
  codePrefix: string,
  namePrefix: string,
  start: number,
  count: number,
  pad: number,
): BulkOrgNodeEntry[] {
  const items: BulkOrgNodeEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const num = String(start + i).padStart(pad, '0');
    items.push({ code: `${codePrefix}${num}`, name: `${namePrefix} ${start + i}` });
  }
  return items;
}

function parseLines(text: string): BulkOrgNodeEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [code, ...rest] = line.split(',');
      const trimmedCode = (code ?? '').trim();
      const name = rest.join(',').trim();
      return { code: trimmedCode, name: name || trimmedCode };
    });
}

/** Bulk creation dialog: generate a numbered range or paste one entry per line. */
export function BulkCreateDialog({ open, onClose, config }: BulkCreateDialogProps): JSX.Element {
  const parentOptions = useOrgOptions(config.parent?.endpoint ?? null);
  const bulkCreate = useBulkCreateOrgNodes(config.endpoint);

  const [mode, setMode] = useState<Mode>('range');
  const [parentId, setParentId] = useState('');
  const [codePrefix, setCodePrefix] = useState('');
  const [namePrefix, setNamePrefix] = useState('');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [pad, setPad] = useState(2);
  const [lines, setLines] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const items = useMemo<BulkOrgNodeEntry[]>(() => {
    if (mode === 'range') {
      if (!codePrefix.trim() || count < 1) return [];
      return generateRange(
        codePrefix.trim().toUpperCase(),
        namePrefix.trim() || config.singular.charAt(0).toUpperCase() + config.singular.slice(1),
        Math.max(1, start),
        Math.min(count, MAX_ITEMS),
        pad,
      );
    }
    return parseLines(lines).slice(0, MAX_ITEMS);
  }, [mode, codePrefix, namePrefix, start, count, pad, lines, config.singular]);

  const reset = (): void => {
    setError(null);
    setCreatedCount(null);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setCreatedCount(null);
    if (!parentId) {
      setError(`Select a ${config.parent?.label.toLowerCase() ?? 'parent'} first`);
      return;
    }
    if (items.length === 0) {
      setError('Nothing to create — check your inputs');
      return;
    }
    try {
      const created = await bulkCreate.mutateAsync({ parentId, items });
      setCreatedCount(created.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk create {config.title.toLowerCase()}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {createdCount !== null && (
            <Alert severity="success">
              Created {createdCount} {config.title.toLowerCase()}. You can close this dialog or
              create another batch.
            </Alert>
          )}
          <TextField
            select
            label={config.parent?.label}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            {(parentOptions.data ?? []).map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.name}
                {option.code ? ` (${option.code})` : ''}
              </MenuItem>
            ))}
          </TextField>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_, value: Mode | null) => value && setMode(value)}
          >
            <ToggleButton value="range">Generate range</ToggleButton>
            <ToggleButton value="lines">Paste lines</ToggleButton>
          </ToggleButtonGroup>

          {mode === 'range' ? (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Code prefix"
                  placeholder="GATE-"
                  value={codePrefix}
                  onChange={(e) => setCodePrefix(e.target.value)}
                />
                <TextField
                  label="Name prefix"
                  placeholder="Gate"
                  value={namePrefix}
                  onChange={(e) => setNamePrefix(e.target.value)}
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Start at"
                  type="number"
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                />
                <TextField
                  label="How many"
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  helperText={`Max ${MAX_ITEMS}`}
                />
                <TextField
                  label="Digits"
                  type="number"
                  value={pad}
                  onChange={(e) => setPad(Number(e.target.value))}
                  helperText="Zero padding"
                />
              </Stack>
            </>
          ) : (
            <TextField
              label="One per line: CODE or CODE, Name"
              multiline
              minRows={6}
              placeholder={'R-A-01, Rack A1\nR-A-02, Rack A2\nR-A-03'}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
            />
          )}

          {items.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">
                Preview — {items.length} {config.title.toLowerCase()}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {items.slice(0, 8).map((item) => (
                  <Chip key={item.code} label={item.code} size="small" />
                ))}
                {items.length > 8 && <Chip label={`+${items.length - 8} more`} size="small" />}
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={bulkCreate.isPending || items.length === 0}
        >
          {bulkCreate.isPending ? 'Creating…' : `Create ${items.length || ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
