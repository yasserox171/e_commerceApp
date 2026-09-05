import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { formatMAD, truncate } from '../i18n/format';
import { useTheme } from '../theme/ThemeProvider';
import type { ProductSummary } from '../types';
import { Badge } from './Badge';
import { Price } from './Price';
import { ProductImage } from './ProductImage';
import { Text } from './Text';

export interface ProductCardProps {
  product: ProductSummary;
  width: number;
  onPress: (product: ProductSummary) => void;
  /** Retail shows a quick "add to cart"; wholesale opens the quantity sheet. */
  onQuickAdd?: (product: ProductSummary) => void;
  quickAddIcon?: keyof typeof Ionicons.glyphMap;
  /** Wholesale cards surface the MOQ and the best available tier. */
  showWholesaleMeta?: boolean;
  style?: ViewStyle;
}

/**
 * The catalogue's unit of currency.
 *
 * Layout follows the 2026 pattern: a large image doing the selling, a two-line
 * title, then price — with badges reserved for the one thing worth interrupting
 * for (a discount, or being out of stock). The quick-add button sits inside the
 * image's bottom corner, in the thumb zone, so a one-handed scroll can add
 * without opening the detail screen.
 */
export function ProductCard({
  product,
  width,
  onPress,
  onQuickAdd,
  quickAddIcon = 'add',
  showWholesaleMeta = false,
  style,
}: ProductCardProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (toValue: number) => {
      Animated.spring(scale, { toValue, useNativeDriver: true, speed: 45, bounciness: 3 }).start();
    },
    [scale],
  );

  const bestTier = product.tiers.length > 1 ? product.tiers[product.tiers.length - 1] : null;
  const unavailable = !product.inStock;

  return (
    <Animated.View style={[{ width, transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => onPress(product)}
        onPressIn={() => animate(theme.motion.pressScale)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel={`${product.title}، ${formatMAD(product.price)}`}
        style={{ gap: theme.spacing.sm }}
      >
        <View>
          <ProductImage
            uri={product.primaryImage}
            radius={theme.radius.lg}
            style={unavailable ? styles.dimmed : undefined}
          />

          <View style={[styles.badgeStack, { top: theme.spacing.sm, insetInlineStart: theme.spacing.sm, gap: theme.spacing.xs }]}>
            {product.discountPercent !== null && product.discountPercent > 0 && (
              <Badge label={`−${product.discountPercent}%`} tone="danger" />
            )}
            {unavailable && <Badge label="نفد المخزون" tone="neutral" icon="close-circle-outline" />}
          </View>

        </View>

        <View style={{ gap: theme.spacing.xxs }}>
          {product.supplier && (
            <Text variant="micro" color={theme.colors.textSubtle} numberOfLines={1}>
              {product.supplier}
            </Text>
          )}

          <Text variant="callout" numberOfLines={2}>
            {truncate(product.title, 70)}
          </Text>

          <Price
            value={product.price}
            compareAt={product.compareAtPrice}
            variant="price"
            color={theme.colors.text}
          />

          {showWholesaleMeta && (
            <View style={{ gap: theme.spacing.xxs, marginTop: theme.spacing.xxs }}>
              <Text variant="micro" color={theme.colors.textSubtle}>
                الحد الأدنى: {product.minOrderQuantity} {product.unit ?? 'قطعة'}
              </Text>
              {bestTier && (
                <Text variant="micro" color={theme.colors.accent}>
                  ابتداءً من {bestTier.minQuantity} → {formatMAD(bestTier.unitPrice)}
                </Text>
              )}
            </View>
          )}
        </View>
      </Pressable>

      {/* Sibling of the card's Pressable, not a child: a touchable inside a
          touchable renders as a <button> nested in a <button> on web, which is
          invalid HTML, and on native it makes the hit areas fight. The image is
          square and flush to the card's width, so its bottom edge is at `width`. */}
      {onQuickAdd && !unavailable && (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onQuickAdd(product);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`إضافة ${product.title}`}
          style={[
            styles.quickAdd,
            theme.shadows.sm,
            {
              backgroundColor: theme.colors.primary,
              top: width - QUICK_ADD_SIZE - theme.spacing.sm,
              insetInlineEnd: theme.spacing.sm,
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Ionicons name={quickAddIcon} size={20} color={theme.colors.onPrimary} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const QUICK_ADD_SIZE = 40;

const styles = StyleSheet.create({
  badgeStack: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  quickAdd: {
    position: 'absolute',
    width: QUICK_ADD_SIZE,
    height: QUICK_ADD_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
});
