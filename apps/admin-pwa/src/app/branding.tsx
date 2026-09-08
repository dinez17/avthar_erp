import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box } from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import type { BrandingInfo } from '@tiles-erp/shared-types';
import { apiFetch } from '../lib/api-client';

const BRANDING_KEY = 'branding';

/** The name shown before the server answers, and if it never does. */
const FALLBACK: BrandingInfo = { appName: 'Tiles ERP', logo: null };

/**
 * The company's name and logo.
 *
 * Served by a public endpoint, so this works on the login screen and for users
 * without SETTINGS_MANAGE. Cached for the session: branding changes perhaps twice in
 * the life of an installation, and refetching it per screen would be absurd.
 */
export function useBranding(): BrandingInfo {
  const { data } = useQuery({
    queryKey: [BRANDING_KEY],
    queryFn: () => apiFetch<BrandingInfo>('/settings/branding'),
    staleTime: Infinity,
    // A branded shell is a nicety; a retry storm on a dead API is not. One try.
    retry: 1,
  });

  return data ?? FALLBACK;
}

/** The query key, so saving a setting can invalidate the cached branding. */
export const brandingQueryKey = [BRANDING_KEY];

/**
 * Pushes the branding into the two places React cannot reach: the document title and
 * the browser tab icon.
 *
 * Rendered once, near the root. The favicon is swapped by rewriting the href of the
 * existing <link rel="icon">, which every browser honours at runtime — unlike the PWA
 * manifest icon, which is fixed at build time and needs a redeploy to change.
 */
export function BrandingEffect(): null {
  const { appName, logo } = useBranding();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  useEffect(() => {
    if (!logo) return;

    const head = document.head;
    // Replace every existing icon link rather than adding another: browsers pick
    // among them by size and type, and leaving the old one in makes the result
    // depend on which the browser happens to prefer.
    const existing = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    existing.forEach((link) => link.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = logo;
    head.appendChild(link);

    return () => {
      link.remove();
      existing.forEach((old) => head.appendChild(old));
    };
  }, [logo]);

  return null;
}

/**
 * The logo as it appears on a printed letterhead.
 *
 * A plain <img> rather than a MUI component: these pages are built from bare
 * elements and a print stylesheet, and keeping the markup simple keeps what lands
 * on paper predictable. Renders nothing when no logo is set, so the existing
 * text-only letterhead is unchanged for anyone who has not uploaded one.
 */
export function PrintLogo({ height = 56 }: { height?: number }): JSX.Element | null {
  const { logo, appName } = useBranding();
  if (!logo) return null;

  return (
    <img
      src={logo}
      alt={appName}
      style={{
        height,
        maxWidth: 240,
        objectFit: 'contain',
        display: 'block',
        margin: '0 auto 6px',
      }}
    />
  );
}

/**
 * The company mark: the uploaded logo, or the gradient placeholder when there is none.
 *
 * The logo is sized by HEIGHT with width left free, not boxed into a square. Company
 * logos are rarely square — a tall emblem or a wide wordmark forced into one is
 * letterboxed down to a fraction of the space it was given. Width is capped at 2.4×
 * the height so a very wide wordmark cannot push the app name off the sidebar.
 *
 * Never cropped: `contain` keeps the whole mark visible, because deciding which part
 * of someone's logo to cut off is not this component's call.
 */
export function BrandMark({ size = 34 }: { size?: number }): JSX.Element {
  const { logo, appName } = useBranding();

  if (logo) {
    return (
      <Box
        component="img"
        src={logo}
        alt={appName}
        sx={{
          height: size,
          width: 'auto',
          maxWidth: size * 2.4,
          objectFit: 'contain',
          flex: 'none',
          display: 'block',
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.29)}px`,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        background: 'linear-gradient(135deg, #3A57E8, #7B8CF5)',
        color: '#fff',
        boxShadow: '0 4px 10px rgba(58,87,232,.32)',
      }}
    >
      <GridViewIcon sx={{ fontSize: size * 0.56 }} />
    </Box>
  );
}
