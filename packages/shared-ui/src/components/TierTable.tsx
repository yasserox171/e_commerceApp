import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { formatMAD } from '../i18n/format.js';
import { useTheme } from '../theme/ThemeProvider.js';
import type { PriceTier } from '../types.js';
import { Badge } from './Badge.js';
import { Text } from './Text.js';

export interface TierTableProps {
  tiers: PriceTier[];
  /** Highlights the row the buyer's current quantity falls into. */
  activeQuantity?: number;
  unit?: string | null;
  style?: ViewStyle;
}

/**
 * The wholesale price ladder.
 *
 * Showing the whole ladder — not just the price at the current quantity — is
 * what makes a buyer add twelve more units: they can see the next break and
 * what it saves them.
 */
export function TierTable({ tiers, activeQuantity, unit, style }: TierTableProps) {
  const theme = useTheme();
  if (tiers.length <= 1) return null;

  const activeIndex =
    activeQuantity === undefined
      ? -1
      : tiers.reduce(
          (best, tier, index) => (activeQuantity >= tier.minQuantity ? index : best),
          0,
        );

  const cheapest = tiers[tiers.length - 1]!.unitPrice;
  const dearest = tiers[0]!.unitPrice;

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      {tiers.map((tier, index) => {
        const isActive = index === activeIndex;
        const saving = dearest > 0 ? Math.round(((dearest - tier.unitPrice) / dearest) * 100) : 0;

        return (
          <View
            key={`${tier.minQuantity}-${tier.unitPrice}`}
            style={[
              styles.row,
              {
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.md,
                gap: theme.spacing.sm,
                backgroundColor: isActive ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                borderWidth: isActive ? 1.5 : 0,
                borderColor: isActive ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <View style={styles.quantityCell}>
              <Text variant="callout" color={isActive ? theme.colors.primary : theme.colors.text}>
                {index === tiers.length - 1
                  ? `${tier.minQuantity}+`
                  : `${tier.minQuantity} – ${tiers[index + 1]!.minQuantity - 1}`}
              </Text>
              {unit && (
                <Text variant="micro" color={theme.colors.textSubtle}>
                  {unit}
                </Text>
              )}
            </View>

            <View style={[styles.priceCell, { gap: theme.spacing.sm }]}>
              {saving > 0 && <Badge label={`−${saving}%`} tone={isActive ? 'primary' : 'success'} />}
              <Text
                variant="bodyStrong"
                color={isActive ? theme.colors.primary : theme.colors.text}
                style={styles.ltr}
              >
                {formatMAD(tier.unitPrice)}
              </Text>
            </View>
          </View>
        );
      })}

      {cheapest < dearest && (
        <Text variant="micro" color={theme.colors.textSubtle}>
          كلما زادت الكمية، انخفض ثمن الوحدة — أفضل سعر {formatMAD(cheapest)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ltr: {
    writingDirection: 'ltr',
  },
});
