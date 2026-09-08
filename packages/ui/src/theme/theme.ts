import { createTheme, type PaletteMode, type Theme } from '@mui/material';
import { getPalette, getShadows } from './palette';

/**
 * The shared MUI theme.
 *
 * Two ideas carry the look, and everything else follows from them:
 *
 * 1. **Cards are lifted, not outlined.** White panels on a cool grey ground with a
 *    shallow shadow. Borders are kept for controls, where an edge means "you can
 *    interact with this" rather than "this is a separate object".
 * 2. **Density is preserved.** This is an ERP: operators read hundreds of rows a
 *    day. The radii and shadows are softer than before, but the type scale, control
 *    sizes and row heights stay compact. A pretty theme that fits a third fewer rows
 *    on screen would be a downgrade.
 */
export const createAppTheme = (mode: PaletteMode): Theme => {
  const shadow = getShadows(mode);
  const isLight = mode === 'light';

  // Read back from the built theme rather than poking at PaletteOptions, whose
  // fields are all optional and need casting at every use.
  const base = createTheme({ palette: getPalette(mode) });
  const { divider, background, text } = base.palette;
  const display = 'Plus Jakarta Sans, Inter, sans-serif';

  return createTheme(base, {
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: ['Inter', 'Roboto', 'Segoe UI', 'system-ui', 'sans-serif'].join(','),
      // Headings use Plus Jakarta Sans for a little more character in titles and
      // figures; body and controls stay on Inter, which is built for small sizes.
      h1: { fontFamily: display, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.4px' },
      h2: { fontFamily: display, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.3px' },
      h3: { fontFamily: display, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.2px' },
      h4: { fontFamily: display, fontSize: '1.05rem', fontWeight: 700 },
      h5: { fontFamily: display, fontSize: '0.95rem', fontWeight: 700 },
      h6: { fontFamily: display, fontSize: '0.875rem', fontWeight: 700 },
      subtitle2: { fontSize: '0.8rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
      body2: { fontSize: '0.825rem' },
      caption: { fontSize: '0.72rem' },
      overline: { fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.09em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Digits that sit in columns must not jitter as values change.
          '.num, td, th': { fontVariantNumeric: 'tabular-nums' },
          '*::-webkit-scrollbar': { width: 8, height: 8 },
          '*::-webkit-scrollbar-thumb': {
            background: isLight ? '#DFE2EE' : '#363C4F',
            borderRadius: 4,
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          // MUI's default elevation ladder is far heavier than this design wants.
          root: { backgroundImage: 'none' },
          elevation1: { boxShadow: shadow.md },
        },
      },

      MuiCard: {
        // Elevated, not outlined — the change that defines the new look.
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: 16, boxShadow: shadow.md, border: 'none' },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: '17px 20px', borderBottom: `1px solid ${divider}` },
          title: { fontFamily: display, fontSize: '0.95rem', fontWeight: 700 },
          subheader: { fontSize: '0.75rem' },
        },
      },
      MuiCardContent: {
        styleOverrides: { root: { padding: '16px 20px', '&:last-child': { paddingBottom: 20 } } },
      },

      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: {
          root: { borderRadius: 9, padding: '7px 15px' },
          containedPrimary: {
            boxShadow: isLight ? '0 4px 12px rgba(58,87,232,.28)' : 'none',
            '&:hover': { boxShadow: isLight ? '0 6px 16px rgba(58,87,232,.32)' : 'none' },
          },
        },
      },

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
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 9 } } },

      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: { background: background.paper, borderBottom: `1px solid ${divider}` },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { border: 'none', borderRight: `1px solid ${divider}`, backgroundImage: 'none' },
        },
      },

      MuiIconButton: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { borderRadius: 9 } },
      },

      MuiChip: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: { borderRadius: 20, fontWeight: 600, fontSize: '0.72rem' },
          // Soft-filled status pills rather than solid blocks of colour.
          filled: { border: 'none' },
        },
      },

      MuiToolbar: {
        styleOverrides: {
          root: { minHeight: 64, '@media (min-width:600px)': { minHeight: 64 } },
        },
      },

      MuiListItemButton: {
        styleOverrides: { root: { paddingTop: 6, paddingBottom: 6, borderRadius: 8 } },
      },

      MuiTable: { defaultProps: { size: 'small' } },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              background: background.default,
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: text.disabled,
              borderBottom: 'none',
              whiteSpace: 'nowrap',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${divider}`, padding: '10px 16px' },
        },
      },

      MuiDialog: { styleOverrides: { paper: { borderRadius: 16, boxShadow: shadow.lg } } },
      MuiDialogTitle: {
        styleOverrides: { root: { fontFamily: display, fontWeight: 700, fontSize: '1.05rem' } },
      },
      MuiDialogContent: { styleOverrides: { root: { paddingTop: 12, paddingBottom: 12 } } },

      MuiMenu: { styleOverrides: { paper: { borderRadius: 12, boxShadow: shadow.lg } } },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: 8, fontSize: '0.72rem', padding: '6px 10px' } },
      },
      MuiTablePagination: {
        styleOverrides: { toolbar: { minHeight: 44 }, root: { fontSize: '0.8rem' } },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    },
  });
};
