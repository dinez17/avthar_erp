import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { changePasswordSchema, type ChangePasswordInput } from '@tiles-erp/validation';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError, apiFetch } from '../../lib/api-client';

export function ProfilePage(): JSX.Element {
  const { user } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    setSuccess(false);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      setSuccess(true);
      form.reset();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit());

  return (
    <PageContainer title="My profile" subtitle="Your account details and security.">
      <Stack spacing={2} sx={{ maxWidth: 560 }}>
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">Account</Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
              <Divider />
              <Typography variant="subtitle2">Roles</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(user?.roles ?? []).map((role) => (
                  <Chip key={role} label={role} size="small" />
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <form onSubmit={onSubmit} noValidate autoComplete="off">
              <Stack spacing={2}>
                <Typography variant="h6">Change password</Typography>
                {serverError && <Alert severity="error">{serverError}</Alert>}
                {success && <Alert severity="success">Password changed.</Alert>}
                <TextField
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  error={Boolean(form.formState.errors.currentPassword)}
                  helperText={form.formState.errors.currentPassword?.message}
                  {...form.register('currentPassword')}
                />
                <TextField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  error={Boolean(form.formState.errors.newPassword)}
                  helperText={form.formState.errors.newPassword?.message}
                  {...form.register('newPassword')}
                />
                <TextField
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  error={Boolean(form.formState.errors.confirmPassword)}
                  helperText={form.formState.errors.confirmPassword?.message}
                  {...form.register('confirmPassword')}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={form.formState.isSubmitting}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Update password
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Stack>
    </PageContainer>
  );
}
