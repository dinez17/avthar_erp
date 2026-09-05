import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { SettingItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useSettings, useUpdateSetting } from './api';

function SettingRow({ setting }: { setting: SettingItem }): JSX.Element {
  const updateSetting = useUpdateSetting();
  const [value, setValue] = useState(setting.value);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(setting.value);
  }, [setting.value]);

  const dirty = value !== setting.value;

  const save = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    try {
      await updateSetting.mutateAsync({ key: setting.key, value, version: setting.version });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">{setting.key}</Typography>
            {saved && !dirty && (
              <Typography variant="caption" color="success.main">
                Saved
              </Typography>
            )}
          </Stack>
          {setting.description && (
            <Typography variant="body2" color="text.secondary">
              {setting.description}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              size="small"
              // Multi-line settings such as the printed quotation terms need real
              // line breaks, so the field grows instead of forcing an escape sequence.
              multiline
              maxRows={8}
            />
            <Button
              variant="contained"
              size="small"
              disabled={!dirty || updateSetting.isPending}
              onClick={() => void save()}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SettingsPage(): JSX.Element {
  const { data, isLoading } = useSettings();

  return (
    <PageContainer title="Settings" subtitle="Application-wide configuration.">
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        {isLoading &&
          [1, 2, 3].map((n) => <Skeleton key={n} variant="rounded" height={120} />)}
        {(data ?? []).map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </Stack>
    </PageContainer>
  );
}
