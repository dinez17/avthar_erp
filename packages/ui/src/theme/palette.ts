import type { PaletteMode, PaletteOptions } from '@mui/material';

/**
 * Brand palette.
 *
 * Indigo rather than a pure blue: it holds its identity against the greys and the
 * status colours without competing with them. The neutrals are biased very slightly
 * toward that indigo — a pure mid-grey beside a saturated accent reads as unrelated.
 *
 * Status colours are deliberately NOT derived from the accent. "Paid", "overdue" and
 * "draft" have to be legible as state at a glance, which they stop being the moment
 * they share a hue with navigation and primary actions.
 */
export const brand = {
  primary: '#3A57E8',
  primaryDark: '#2438B8',
  primaryWash: '#EAEDFD',
  secondary: '#5A6474',
  success: '#1AA053',
  warning: '#F16A1B',
  error: '#C03221',
  info: '#079AA2',
} as const;

/** Soft backgrounds for icon chips and status pills, keyed to the semantic colours. */
export interface WashSet {
  primary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  neutral: string;
}

/**
 * Layered shadows.
 *
 * Cards are separated by elevation rather than a 1px outline, which is the single
 * biggest visual difference from the previous theme. Kept shallow and low-contrast:
 * a dense ERP screen with heavy drop shadows on every panel reads as cluttered.
 */
export interface ShadowSet {
  sm: string;
  md: string;
  lg: string;
}

// These are typed as the interfaces above rather than inferred with `as const`.
// Inferring would give each set its own literal string types, and the light set's
// literals are not assignable to the dark set's — so a function returning "one of
// the two" fails to compile.
const wash: Record<PaletteMode, WashSet> = {
  light: {
    primary: '#EAEDFD',
    success: '#E3F5EB',
    warning: '#FEEDE1',
    error: '#FBE7E4',
    info: '#E1F4F5',
    neutral: '#F1F3F9',
  },
  dark: {
    primary: '#23294A',
    success: '#17301F',
    warning: '#35251A',
    error: '#351D1B',
    info: '#122A2C',
    neutral: '#212533',
  },
};

const shadows: Record<PaletteMode, ShadowSet> = {
  light: {
    sm: '0 1px 2px rgba(35,45,66,.06)',
    md: '0 4px 16px rgba(35,45,66,.07)',
    lg: '0 12px 32px rgba(35,45,66,.10)',
  },
  dark: {
    sm: '0 1px 2px rgba(0,0,0,.4)',
    md: '0 4px 16px rgba(0,0,0,.45)',
    lg: '0 12px 32px rgba(0,0,0,.55)',
  },
};

export const getWash = (mode: PaletteMode): WashSet => wash[mode];
export const getShadows = (mode: PaletteMode): ShadowSet => shadows[mode];

export const getPalette = (mode: PaletteMode): PaletteOptions =>
  mode === 'light'
    ? {
        mode,
        primary: {
          main: brand.primary,
          dark: brand.primaryDark,
          light: wash.light.primary,
          contrastText: '#FFFFFF',
        },
        secondary: { main: brand.secondary },
        success: { main: brand.success, light: wash.light.success },
        warning: { main: brand.warning, light: wash.light.warning },
        error: { main: brand.error, light: wash.light.error },
        info: { main: brand.info, light: wash.light.info },
        // The page ground is a cool grey, so white cards lift off it without needing
        // a border. That difference is what carries the whole card treatment.
        background: { default: '#F1F3F9', paper: '#FFFFFF' },
        text: { primary: '#232D42', secondary: '#5A6474', disabled: '#8A92A6' },
        divider: '#E9EBF3',
        action: { hover: '#F1F3F9', selected: '#EAEDFD' },
      }
    : {
        mode,
        primary: {
          main: '#6E85F5',
          dark: '#4A63E7',
          light: wash.dark.primary,
          contrastText: '#0F1117',
        },
        secondary: { main: '#8990A3' },
        success: { main: '#43C47D', light: wash.dark.success },
        warning: { main: '#F6924A', light: wash.dark.warning },
        error: { main: '#E4695A', light: wash.dark.error },
        info: { main: '#3FBFC6', light: wash.dark.info },
        background: { default: '#14161F', paper: '#1B1E2A' },
        text: { primary: '#E7EAF3', secondary: '#B2B9CA', disabled: '#8990A3' },
        divider: '#2B3040',
        action: { hover: '#212533', selected: '#262C48' },
      };
