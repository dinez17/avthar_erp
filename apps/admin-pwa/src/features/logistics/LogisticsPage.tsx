import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useEffect, useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import {
  useCreateLogistics,
  useDeleteLogistics,
  useLogisticsList,
  useNextLogisticsCode,
  useTransporterOptions,
  useUpdateLogistics,
} from './api';
import { STATE_OPTIONS, type FieldSpec, type LogisticsEntityConfig } from './config';

type Row = Record<string, unknown> & { id: string; version: number };

const toInputValue = (value: unknown, kind: FieldSpec['kind']): string | boolean | number => {
  if (kind === 'switch') return value === undefined ? true : Boolean(value);
  if (value === null || value === undefined) return '';
  if (kind === 'date') return String(value).slice(0, 10);
  return value as string | number;
};

/**
 * Field-spec driven master page shared by transporters, vehicles and drivers.
 * Each entity declares its sections, fields and grid columns in config.
 */
export function LogisticsPage({ config }: { config: LogisticsEntityConfig }): JSX.Element {
  const pagination = usePagination();
  const [transporterFilter, setTransporterFilter] = useState('');
  const { data, isFetching } = useLogisticsList<Row>(
    config.endpoint,
    pagination.query,
    config.filterByTransporter ? transporterFilter || undefined : undefined,
  );
  const transporters = useTransporterOptions();
  const createItem = useCreateLogistics<Row>(config.endpoint);
  const updateItem = useUpdateLogistics<Row>(config.endpoint);
  const deleteItem = useDeleteLogistics(config.endpoint);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean | number>>({});
  const [error, setError] = useState<string | null>(null);

  const nextCode = useNextLogisticsCode(config.endpoint, config.hasCode && dialogOpen && !editing);

  useEffect(() => {
    if (dialogOpen && !editing && nextCode.data && !values.code) {
      setValues((prev) => ({ ...prev, code: nextCode.data }));
    }
  }, [dialogOpen, editing, nextCode.data, values.code]);

  const blankValues = useMemo(() => {
    const initial: Record<string, string | boolean | number> = {};
    for (const field of config.fields) {
      initial[field.name] = field.kind === 'switch' ? true : '';
    }
    return initial;
  }, [config.fields]);

  const openCreate = (): void => {
    setEditing(null);
    setError(null);
    setValues(blankValues);
    setDialogOpen(true);
  };

  const openEdit = (row: Row): void => {
    setEditing(row);
    setError(null);
    const next: Record<string, string | boolean | number> = {};
    for (const field of config.fields) {
      next[field.name] = toInputValue(row[field.name], field.kind);
    }
    setValues(next);
    setDialogOpen(true);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const value = values[field.name];
      if (field.kind === 'switch') {
        payload[field.name] = Boolean(value);
        continue;
      }
      if (value === '' || value === undefined) continue;
      if (field.kind === 'number') payload[field.name] = Number(value);
      else if (field.kind === 'date') payload[field.name] = new Date(String(value)).toISOString();
      else payload[field.name] = value;
    }

    const missing = config.fields.find((f) => f.required && !payload[f.name]);
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }

    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.id, ...payload, version: editing.version });
      } else {
        await createItem.mutateAsync(payload);
      }
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const sections = useMemo(() => {
    const grouped = new Map<string, FieldSpec[]>();
    for (const field of config.fields) {
      grouped.set(field.section, [...(grouped.get(field.section) ?? []), field]);
    }
    return [...grouped.entries()];
  }, [config.fields]);

  const optionsFor = (field: FieldSpec): { value: string; label: string }[] => {
    if (field.optionSource === 'states') return STATE_OPTIONS;
    if (field.optionSource === 'transporters') {
      return (transporters.data ?? []).map((t) => ({ value: t.id, label: t.name }));
    }
    return field.options ?? [];
  };

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      ...(config.columns as unknown as ColDef<Row>[]),
      {
        headerName: '',
        maxWidth: 100,
        cellRenderer: (p: ICellRendererParams<Row>) => (
          <>
            <IconButton size="small" aria-label="Edit" onClick={() => p.data && openEdit(p.data)}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              onClick={() => p.data && setDeleting(p.data)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        ),
      },
    ],
    [config],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), dialogOpen);

  return (
    <PageContainer
      title={config.title}
      subtitle={config.subtitle}
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New {config.singular}
        </Button>
      }
    >
      <Stack spacing={1}>
        {config.filterByTransporter && (
          <TextField
            select
            label="Transporter"
            size="small"
            fullWidth={false}
            value={transporterFilter}
            onChange={(e) => {
              setTransporterFilter(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 220 }}
          >
            <MenuItem value="">All transporters</MenuItem>
            {(transporters.data ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder={config.searchPlaceholder}
          height={620}
        />
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing ? `Edit ${String(editing.name ?? editing.number ?? '')}` : `Create ${config.singular}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {sections.map(([section, fields], index) => (
              <Stack key={section} spacing={1.5}>
                {index > 0 && <Divider />}
                <Typography variant="subtitle2">{section}</Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  {fields.map((field) => {
                    if (field.kind === 'switch') {
                      return (
                        <FormControlLabel
                          key={field.name}
                          control={
                            <Switch
                              checked={Boolean(values[field.name])}
                              onChange={(e) =>
                                setValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                              }
                            />
                          }
                          label={field.label}
                        />
                      );
                    }
                    const isSelect = field.kind === 'select';
                    const isWide = field.kind === 'multiline';
                    return (
                      <TextField
                        key={field.name}
                        select={isSelect}
                        multiline={isWide}
                        minRows={isWide ? 2 : undefined}
                        type={
                          field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'
                        }
                        label={field.required ? `${field.label} *` : field.label}
                        required={field.required}
                        helperText={field.helper}
                        fullWidth={isWide}
                        InputLabelProps={field.kind === 'date' ? { shrink: true } : undefined}
                        value={values[field.name] ?? ''}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        sx={isWide ? undefined : { width: 220 }}
                      >
                        {isSelect && (
                          <MenuItem value="">
                            <em>None</em>
                          </MenuItem>
                        )}
                        {isSelect &&
                          optionsFor(field).map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                      </TextField>
                    );
                  })}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={createItem.isPending || updateItem.isPending}
          >
            {editing ? 'Save changes' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${config.singular}`}
        message={`Delete "${String(deleting?.name ?? deleting?.number ?? '')}"? The record is soft-deleted.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteItem.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
