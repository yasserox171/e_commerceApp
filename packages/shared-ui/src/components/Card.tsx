import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider.js';

export interface CardProps extends ViewProps {
  children: ReactNode;
  /**
   * `raised` uses a shadow, `outlined` a hairline border, `flat` neither.
   * 2026 catalogues lean on `outlined` — cards that sit on the page rather
   * than float above it.
   */
  appearance?: 'raised' | 'outlined' | 'flat';
  padding?: keyof ReturnType<typeof useTheme>['spacing'];
  radiusToken?: keyof ReturnType<typeof useTheme>['radius'];
}

export function Card({
  children,
  appearance = 'outlined',
  padding = 'lg',
  radiusToken = 'lg',
  style,
  ...props
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius[radiusToken],
    padding: theme.spacing[padding],
    overflow: 'hidden',
  };

  const variant: ViewStyle =
    appearance === 'raised'
      ? theme.shadows.sm
      : appearance === 'outlined'
        ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: theme.colors.border }
        : {};

  return (
    <View {...props} style={[base, variant, style]}>
      {children}
    </View>
  );
}

export function Divider({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: theme.colors.border }, style]}
    />
  );
}
