import { CssBaseline, ThemeProvider, type PaletteMode } from '@mui/material';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage, useMediaQuery } from '@tiles-erp/hooks';
import { createAppTheme } from './theme';

interface ColorModeContextValue {
  mode: PaletteMode;
  toggleMode: () => void;
  setMode: (mode: PaletteMode) => void;
}

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

export interface ColorModeProviderProps {
  children: ReactNode;
  storageKey?: string;
}

/** Provides light/dark theme switching, persists the choice and honours OS preference. */
export function ColorModeProvider({
  children,
  storageKey = 'tiles-erp:color-mode',
}: ColorModeProviderProps): JSX.Element {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useLocalStorage<PaletteMode>(storageKey, prefersDark ? 'dark' : 'light');
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [mode, setMode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within a ColorModeProvider');
  return ctx;
}
