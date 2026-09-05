import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Renders the icon after the label in reading order. */
  iconTrailing?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Fires a light impact on press. On by default for primary actions. */
  haptic?: boolean;
}

const SIZES: Record<Size, { height: number; paddingHorizontal: number; gap: number; iconSize: number }> = {
  sm: { height: 38, paddingHorizontal: 14, gap: 6, iconSize: 16 },
  md: { height: 48, paddingHorizontal: 20, gap: 8, iconSize: 18 },
  lg: { height: 56, paddingHorizontal: 24, gap: 10, iconSize: 20 },
};

/**
 * The press micro-interaction — a small scale dip plus an optional haptic — is
 * the confirmation that a tap registered. It is the difference between an app
 * that feels responsive and one that feels laggy on a slow network, because it
 * lands before the request does.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconTrailing = false,
  fullWidth = false,
  disabled,
  style,
  haptic,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const scale = React.useRef(new Animated.Value(1)).current;
  const metrics = SIZES[size];
  const isDisabled = Boolean(disabled) || loading;
  const shouldVibrate = haptic ?? variant === 'primary';

  const press = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 40,
        bounciness: 4,
      }).start();
    },
    [scale],
  );

  const palette = resolvePalette(variant, theme);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth]}>
      <Pressable
        {...props}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        onPressIn={(event) => {
          press(theme.motion.pressScale);
          if (shouldVibrate) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          press(1);
          onPressOut?.(event);
        }}
        style={[
          styles.base,
          {
            height: metrics.height,
            paddingHorizontal: metrics.paddingHorizontal,
            gap: metrics.gap,
            borderRadius: theme.radius.md,
            backgroundColor: palette.background,
            borderWidth: palette.borderColor ? 1.5 : 0,
            borderColor: palette.borderColor,
            opacity: isDisabled ? 0.55 : 1,
          },
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.foreground} size="small" />
        ) : (
          <View style={[styles.content, { gap: metrics.gap }]}>
            {icon && !iconTrailing && (
              <Ionicons name={icon} size={metrics.iconSize} color={palette.foreground} />
            )}
            <Text
              variant={size === 'lg' ? 'bodyStrong' : 'callout'}
              color={palette.foreground}
              numberOfLines={1}
            >
              {label}
            </Text>
            {icon && iconTrailing && (
              <Ionicons name={icon} size={metrics.iconSize} color={palette.foreground} />
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function resolvePalette(variant: Variant, theme: ReturnType<typeof useTheme>) {
  switch (variant) {
    case 'primary':
      return { background: theme.colors.primary, foreground: theme.colors.onPrimary, borderColor: undefined };
    case 'secondary':
      return { background: theme.colors.primarySoft, foreground: theme.colors.primary, borderColor: undefined };
    case 'outline':
      return { background: 'transparent', foreground: theme.colors.text, borderColor: theme.colors.borderStrong };
    case 'ghost':
      return { background: 'transparent', foreground: theme.colors.primary, borderColor: undefined };
    case 'danger':
      return { background: theme.colors.danger, foreground: '#FFFFFF', borderColor: undefined };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
