import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { formatMAD } from '../i18n/format';
import { useTheme } from '../theme/ThemeProvider';
import type { TypographyToken } from '../theme/tokens';
import { Text } from './Text';

export interface PriceProps {
  value: number;
  /** Struck-through original price, when the product is discounted. */
  compareAt?: number | null;
  unit?: string | null;
  variant?: Extract<TypographyToken, 'price' | 'priceLarge' | 'bodyStrong' | 'callout' | 'caption' | 'micro'>;
  color?: string;
  compact?: boolean;
  style?: ViewStyle;
}

/**
 * Prices are always laid out left-to-right even inside an RTL screen: a
 * mirrored "45,00 د.م." reads as a different number. The row is forced to
 * `row-reverse` so the currency still lands on the correct side visually.
 */
export function Price({
  value,
  compareAt,
  unit,
  variant = 'price',
  color,
  compact = false,
  style,
}: PriceProps) {
  const theme = useTheme();
  const showCompare = typeof compareAt === 'number' && compareAt > value;

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }, style]}>
      <Text variant={variant} color={color ?? theme.colors.text} style={styles.ltr}>
        {formatMAD(value, { compact })}
      </Text>

      {showCompare && (
        <Text
          variant="caption"
          color={theme.colors.textSubtle}
          style={[styles.ltr, styles.struck]}
        >
          {formatMAD(compareAt, { compact })}
        </Text>
      )}

      {unit && (
        <Text variant="caption" color={theme.colors.textSubtle}>
          / {unit}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  ltr: {
    writingDirection: 'ltr',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
