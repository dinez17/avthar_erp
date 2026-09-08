import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { SettingItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { brandingQueryKey } from '../../app/branding';
import { useUpdateSetting } from './api';

/**
 * Longest side of the stored image, in pixels.
 *
 * 512 covers every place it is shown — a 34px sidebar mark, a print letterhead at
 * 300dpi, a browser tab icon — with room for a retina display, while keeping the
 * encoded string small enough to sit in a settings row and travel in every response
 * that carries branding.
 */
const MAX_EDGE = 512;

/** Refuse anything that would bloat the settings payload. Post-downscale, PNG. */
const MAX_BYTES = 200 * 1024;

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Downscales an image in the browser and returns it as a PNG data URI.
 *
 * Done client-side so the API needs no upload endpoint, no multipart handling and no
 * image library. The canvas also strips EXIF, which is a small privacy win on a photo
 * of a signboard.
 */
async function toDataUri(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read'));
    reader.readAsDataURL(file);
  });

  // An SVG is already small and scales perfectly; rasterising it would only lose
  // quality. Passed through as-is.
  if (file.type === 'image/svg+xml') return raw;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not an image the browser can read'));
    img.src = raw;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not process the image');
  // PNG, so a logo with a transparent background stays transparent on the dark theme.
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}

/** Upload, preview and clear the company logo. */
export function LogoSetting({ setting }: { setting: SettingItem }): JSX.Element {
  const updateSetting = useUpdateSetting();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = setting.value.trim();

  const persist = async (value: string): Promise<void> => {
    await updateSetting.mutateAsync({ key: setting.key, value, version: setting.version });
    // The shell, the favicon and every print header read branding from its own
    // cached query, so it has to be invalidated too or the change appears only
    // after a reload.
    await queryClient.invalidateQueries({ queryKey: brandingQueryKey });
    setSaved(true);
  };

  const onPick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    setSaved(false);

    if (!ACCEPTED.includes(file.type)) {
      setError('Use a PNG, JPEG, WebP or SVG image.');
      return;
    }

    setBusy(true);
    try {
      const dataUri = await toDataUri(file);
      if (dataUri.length > MAX_BYTES) {
        setError(
          `That image is still ${Math.round(dataUri.length / 1024)}KB after resizing. ` +
            'Use a simpler logo, or crop away empty space around it.',
        );
        return;
      }
      await persist(dataUri);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed',
      );
    } finally {
      setBusy(false);
      // Clear the input so picking the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await persist('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the logo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">{setting.key}</Typography>
            {saved && (
              <Typography variant="caption" color="success.main">
                Saved
              </Typography>
            )}
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Shown in the sidebar, on the login screen, on printed documents and as the browser
            tab icon. PNG, JPEG, WebP or SVG — resized to {MAX_EDGE}px automatically.
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
                overflow: 'hidden',
                // A checker ground, so a transparent logo reads as transparent
                // rather than as a white square.
                backgroundImage:
                  'linear-gradient(45deg, rgba(128,128,128,.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.12) 75%), linear-gradient(45deg, rgba(128,128,128,.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.12) 75%)',
                backgroundSize: '12px 12px',
                backgroundPosition: '0 0, 6px 6px',
              }}
            >
              {current ? (
                <Box
                  component="img"
                  src={current}
                  alt="Company logo"
                  sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <Typography variant="caption" color="text.disabled">
                  None
                </Typography>
              )}
            </Box>

            <Stack spacing={1}>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                hidden
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<UploadIcon />}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {current ? 'Replace logo' : 'Upload logo'}
              </Button>
              {current && (
                <Button
                  size="small"
                  color="inherit"
                  startIcon={<DeleteOutlineIcon />}
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Remove
                </Button>
              )}
            </Stack>
          </Stack>

          <Typography variant="caption" color="text.disabled">
            The installed app&apos;s home-screen icon is fixed when the app is built, so it
            keeps the default until the next deploy.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
