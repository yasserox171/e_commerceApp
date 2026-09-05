import React, { type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export interface ScreenProps {
  children: ReactNode;
  /** Which safe-area edges to pad. Tab screens skip 'bottom' — the bar covers it. */
  edges?: Array<'top' | 'bottom'>;
  padded?: boolean;
  background?: 'default' | 'surface';
  style?: ViewStyle;
}

export function Screen({
  children,
  edges = ['top'],
  padded = false,
  background = 'default',
  style,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor:
            background === 'surface' ? theme.colors.surface : theme.colors.background,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingHorizontal: padded ? theme.spacing.lg : 0,
        },
        style,
      ]}
    >
      {/* The bar has to invert with the theme or the time disappears into it. */}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
