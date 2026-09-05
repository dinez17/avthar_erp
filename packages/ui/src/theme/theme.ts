import { createTheme, type PaletteMode, type Theme } from '@mui/material';
import { getPalette } from './palette';

/** Builds the shared MUI theme for the requested colour mode. */
export const createAppTheme = (mode: PaletteMode): Theme =>
  createTheme({
    palette: getPalette(mode),
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: ['Inter', 'Roboto', 'Segoe UI', 'system-ui', 'sans-serif'].join(','),
      h1: { fontSize: '2rem', fontWeight: 700 },
      h2: { fontSize: '1.6rem', fontWeight: 700 },
      h3: { fontSize: '1.35rem', fontWeight: 600 },
      h4: { fontSize: '1.15rem', fontWeight: 600 },
      h5: { fontSize: '1rem', fontWeight: 600 },
      h6: { fontSize: '0.9rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
      body2: { fontSize: '0.825rem' },
      caption: { fontSize: '0.72rem' },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true, size: 'small' } },
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiTextField: {
        defaultProps: {
          size: 'small',
          fullWidth: true,
          // Suppress the browser's own name/address/phone autofill, which otherwise
          // covers in-app suggestion lists. Fields that genuinely want it (login)
          // set their own autoComplete value, which takes precedence.
          autoComplete: 'off',
        },
      },
      MuiAppBar: { defaultProps: { elevation: 0, color: 'default' } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiChip: { defaultProps: { size: 'small' } },
      MuiToolbar: { styleOverrides: { root: { minHeight: 52, '@media (min-width:600px)': { minHeight: 52 } } } },
      MuiListItemButton: { styleOverrides: { root: { paddingTop: 4, paddingBottom: 4 } } },
      MuiDialogContent: { styleOverrides: { root: { paddingTop: 12, paddingBottom: 12 } } },
      MuiTablePagination: {
        styleOverrides: { toolbar: { minHeight: 40 }, root: { fontSize: '0.8rem' } },
      },
    },
  });
