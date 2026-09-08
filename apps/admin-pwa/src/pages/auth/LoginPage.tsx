import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@tiles-erp/validation';
import { AuthLayout } from '../../layouts/AuthLayout';
import { useAuth } from '../../auth/AuthProvider';
import { useBranding } from '../../app/branding';
import { apiBaseUrl, ApiError } from '../../lib/api-client';

/** Email/password sign-in screen. */
export function LoginPage(): JSX.Element {
  const { login, isAuthenticated } = useAuth();
  const { appName } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'Unable to sign in. Please try again.',
      );
    }
  });

  return (
    <AuthLayout title={appName} subtitle="Sign in to your account">
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {serverError && (
            <Alert severity="error">
              {serverError}
              <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.8 }}>
                API: {apiBaseUrl}
              </Typography>
            </Alert>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
