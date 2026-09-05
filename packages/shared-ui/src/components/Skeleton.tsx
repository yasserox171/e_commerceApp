import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider.js';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}

/**
 * A pulsing placeholder, not a spinner. Product images come off a VPS over a
 * Moroccan mobile connection, so the list is visible for a second or two before
 * data lands — a skeleton that matches the final layout stops the page from
 * jumping when it does.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    // Loops keep running through a screen transition otherwise, burning frames
    // on a list the user has already left.
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.skeleton,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        },
        style,
      ]}
    />
  );
}

/** Matches the real ProductCard's proportions so nothing shifts on load. */
export function ProductCardSkeleton({ width }: { width: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, gap: theme.spacing.sm }}>
      <Skeleton width="100%" height={width} radius={theme.radius.lg} />
      <Skeleton width="90%" height={14} />
      <Skeleton width="60%" height={14} />
      <Skeleton width="45%" height={18} />
    </View>
  );
}

export function ListRowSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.row, { gap: theme.spacing.md, padding: theme.spacing.md }]}>
      <Skeleton width={72} height={72} radius={theme.radius.md} />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="50%" height={14} />
        <Skeleton width="35%" height={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
