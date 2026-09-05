import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { buildTheme, type AppVariant, type ColorScheme, type Theme } from './tokens.js';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Which app is rendering — decides whether terracotta or Majorelle leads. */
  variant: AppVariant;
  /** Force a scheme; omit to follow the device. */
  scheme?: ColorScheme;
  children: ReactNode;
}

export function ThemeProvider({ variant, scheme, children }: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const resolved: ColorScheme = scheme ?? (deviceScheme === 'dark' ? 'dark' : 'light');

  const theme = useMemo(() => buildTheme(variant, resolved), [variant, resolved]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return theme;
}

/**
 * Builds a StyleSheet from the theme and memoises it per theme object, so a
 * colour-scheme switch rebuilds styles once rather than on every render.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
