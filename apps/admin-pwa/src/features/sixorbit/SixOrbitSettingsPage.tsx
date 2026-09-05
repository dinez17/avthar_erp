import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import { PERMISSIONS } from '@tiles-erp/config';
import type { SixOrbitConnectionTest } from '@tiles-erp/shared-types';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api-client';
import { useSaveSixOrbitConfig, useSixOrbitConfig, useTestSixOrbitConnection } from './api';

const DEFAULT_TIMEOUT_MS = 30_000;

export function SixOrbitSettingsPage(): JSX.Element {
  const { hasPermission } = useAuth();
  const canConfigure = hasPermission(PERMISSIONS.SIXORBIT_CONFIGURE);

  const { data, isLoading } = useSixOrbitConfig();
  const saveConfig = useSaveSixOrbitConfig();
  const testConnection = useTestSixOrbitConnection();

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('123');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timeout, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<SixOrbitConnectionTest | null>(null);

  useEffect(() => {
    if (!data) return;
    setBaseUrl(data.baseUrl);
    setApiKey(data.apiKey);
    setEmail(data.email);
    setTimeoutMs(data.requestTimeoutMs);
    setIsActive(data.isActive);
    // Never prefilled: the API does not return it, and a blank box is the honest way to
    // show a secret that exists but cannot be read.
    setPassword('');
  }, [data]);

  const save = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    setTestResult(null);
    try {
      await saveConfig.mutateAsync({
        baseUrl,
        apiKey,
        email,
        password: password || undefined,
        requestTimeoutMs: timeout,
        isActive,
        version: data?.version,
      });
      setPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    }
  };

  const test = async (): Promise<void> => {
    setError(null);
    setTestResult(null);
    try {
      setTestResult(await testConnection.mutateAsync());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the connection test');
    }
  };

  if (!canConfigure) {
    return (
      <PageContainer title="SixOrbit">
        <Alert severity="warning">You do not have permission to view these settings.</Alert>
      </PageContainer>
    );
  }

  const needsPassword = !data?.hasPassword && !password;
  const canSave = baseUrl.trim() !== '' && email.trim() !== '' && !saveConfig.isPending;

  return (
    <PageContainer
      title="SixOrbit"
      subtitle="Connection details for the accounting system. Changing them takes effect immediately — no restart."
    >
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        {isLoading && <Skeleton variant="rounded" height={420} />}

        {!isLoading && (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                {error && <Alert severity="error">{error}</Alert>}
                {saved && (
                  <Alert severity="success" onClose={() => setSaved(false)}>
                    Saved. The next call will log in again with these details.
                  </Alert>
                )}

                <TextField
                  label="Base URL"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="http://avthar.sixorbit.com"
                  helperText="The tenant address, without the query string."
                />

                <TextField
                  label="API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  size="small"
                  fullWidth
                  helperText="The constant `key` parameter every request carries. Usually 123."
                />

                <TextField
                  label="Login email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  size="small"
                  fullWidth
                  autoComplete="off"
                />

                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  size="small"
                  fullWidth
                  autoComplete="new-password"
                  placeholder={data?.hasPassword ? '•••••••• (unchanged)' : 'Not set'}
                  helperText={
                    data?.hasPassword
                      ? 'A password is stored. Leave blank to keep it — it cannot be read back.'
                      : 'No password stored yet.'
                  }
                />

                <TextField
                  label="Request timeout (ms)"
                  type="number"
                  value={timeout}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  size="small"
                  sx={{ maxWidth: 240 }}
                  helperText="How long to wait before giving up on a call."
                />

                <FormControlLabel
                  control={
                    <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  }
                  label="Integration active"
                />

                <Divider />

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Button variant="contained" disabled={!canSave} onClick={() => void save()}>
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!data || needsPassword || testConnection.isPending}
                    onClick={() => void test()}
                  >
                    {testConnection.isPending ? 'Testing…' : 'Test connection'}
                  </Button>
                  {data?.tokenFetchedAt && (
                    <Typography variant="caption" color="text.secondary">
                      Last signed in {new Date(data.tokenFetchedAt).toLocaleString()}
                    </Typography>
                  )}
                </Stack>

                {needsPassword && (
                  <Typography variant="caption" color="text.secondary">
                    Enter a password and save before testing the connection.
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {testResult && (
          <Alert severity={testResult.success ? 'success' : 'error'}>
            <AlertTitle>
              {testResult.success ? 'Connected' : 'Could not connect'} ({testResult.durationMs}ms)
            </AlertTitle>
            <Typography variant="body2">{testResult.message}</Typography>
            {testResult.success && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                {testResult.userName && (
                  <Chip size="small" label={`User: ${testResult.userName}`} />
                )}
                {testResult.companyName && (
                  <Chip size="small" label={`Company: ${testResult.companyName}`} />
                )}
                {testResult.companyCode && (
                  <Chip size="small" label={`Code: ${testResult.companyCode}`} />
                )}
                {testResult.outletName && (
                  <Chip size="small" label={`Outlet: ${testResult.outletName}`} />
                )}
              </Stack>
            )}
          </Alert>
        )}

        {baseUrl.startsWith('http://') && (
          <Alert severity="warning">
            <AlertTitle>This connection is not encrypted</AlertTitle>
            SixOrbit carries the password and the session token in the URL itself, so on plain HTTP
            anything between this server and theirs can read them. The tenant answers over HTTPS —
            change the base URL to <code>https://</code> unless you have a specific reason not to.
          </Alert>
        )}
      </Stack>
    </PageContainer>
  );
}
