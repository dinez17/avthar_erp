import type { PaletteMode, PaletteOptions } from '@mui/material';

/** Brand palette for light and dark modes. Tuned for professional ERP density. */
export const brand = {
  primary: '#0B5FFF',
  primaryDark: '#0842B0',
  secondary: '#5A6472',
  success: '#1E874B',
  warning: '#B7791F',
  error: '#C62828',
  info: '#0277BD',
} as const;

export const getPalette = (mode: PaletteMode): PaletteOptions =>
  mode === 'light'
    ? {
        mode,
        primary: { main: brand.primary, dark: brand.primaryDark, contrastText: '#FFFFFF' },
        secondary: { main: brand.secondary },
        success: { main: brand.success },
        warning: { main: brand.warning },
        error: { main: brand.error },
        info: { main: brand.info },
        background: { default: '#F4F6F8', paper: '#FFFFFF' },
        text: { primary: '#1A2027', secondary: '#4B5563' },
        divider: '#E4E7EB',
      }
    : {
        mode,
        primary: { main: '#4C8DFF', dark: brand.primary, contrastText: '#0A0E14' },
        secondary: { main: '#8A94A6' },
        success: { main: '#3FB871' },
        warning: { main: '#D8A13A' },
        error: { main: '#E5534B' },
        info: { main: '#4FB3E0' },
        background: { default: '#0E1116', paper: '#161B22' },
        text: { primary: '#E6EDF3', secondary: '#9DA7B3' },
        divider: '#222932',
      };
