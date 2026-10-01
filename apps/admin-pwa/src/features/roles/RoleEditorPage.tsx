import { zodResolver } from '@hookform/resolvers/zod';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormHelperText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { PermissionPicker } from './PermissionPicker';
import { useCreateRole, usePermissionCodes, useRole, useUpdateRole } from './api';

const roleFormSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(64),
  description: z.string().trim().max(255).optional(),
  isSalesRole: z.boolean(),
  permissionCodes: z.array(z.string()),
});
type RoleFormValues = z.infer<typeof roleFormSchema>;

export function RoleEditorPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useRole(id);
  const permissions = usePermissionCodes();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: '', description: '', isSalesRole: false, permissionCodes: [] },
  });

  useEffect(() => {
    if (!role.data) return;
    form.reset({
      name: role.data.name,
      description: role.data.description ?? '',
      isSalesRole: role.data.isSalesRole,
      permissionCodes: role.data.permissions,
    });
  }, [role.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (id && role.data) {
        await updateRole.mutateAsync({
          id,
          name: role.data.isSystem ? undefined : values.name,
          description: values.description,
          isSalesRole: values.isSalesRole,
          permissionCodes: values.permissionCodes,
          version: role.data.version,
        });
      } else if (!id) {
        await createRole.mutateAsync(values);
      }
      navigate('/roles');
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not save role');
    }
  });
  useSaveShortcut(() => void onSubmit(), (!id || !role.isPending) && !permissions.isPending);

  return (
    <PageContainer
      title={id ? `Edit ${role.data?.name ?? 'role'}` : 'Create role'}
      subtitle="Choose what users with this role can see and do."
      actions={<Stack direction="row" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/roles')}>Back to roles</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void onSubmit()}
          disabled={form.formState.isSubmitting || permissions.isPending || permissions.isError || Boolean(id && !role.data)}>
          Save role
        </Button>
      </Stack>}
    >
      {id && role.isPending ? <CircularProgress /> : id && role.isError ? (
        <Alert severity="error">Could not load this role. Return to Roles and try again.</Alert>
      ) : (
        <Box component="form" onSubmit={onSubmit} noValidate autoComplete="off" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 340px) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack spacing={2}>
              <Typography variant="h6">Role details</Typography>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              <TextField label="Role name" disabled={role.data?.isSystem ?? false}
                error={Boolean(form.formState.errors.name)}
                helperText={role.data?.isSystem ? 'System roles cannot be renamed' : form.formState.errors.name?.message}
                {...form.register('name')} />
              <TextField label="Description" multiline minRows={3} {...form.register('description')} />
              <Controller control={form.control} name="isSalesRole" render={({ field }) => (
                <FormControlLabel control={<Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />}
                  label="Show users with this role in Sales man lists" />
              )} />
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
            <Stack spacing={1}>
              <Typography variant="h6">Access permissions</Typography>
              <Typography variant="body2" color="text.secondary">Open a section to choose individual actions, or select the entire section.</Typography>
              <Controller control={form.control} name="permissionCodes" render={({ field, fieldState }) => (
                <Stack spacing={0.5}>
                  <PermissionPicker codes={permissions.data ?? []} selected={field.value}
                    onChange={field.onChange} disabled={permissions.isPending || permissions.isError} />
                  {permissions.isError && <FormHelperText error>Could not load permissions. Reload this page to retry.</FormHelperText>}
                  {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
                </Stack>
              )} />
            </Stack>
          </Paper>
        </Box>
      )}
    </PageContainer>
  );
}
