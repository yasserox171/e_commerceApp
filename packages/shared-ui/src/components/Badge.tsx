import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', icon, style }: BadgeProps) {
  const theme = useTheme();

  const palette: Record<BadgeTone, { background: string; foreground: string }> = {
    neutral: { background: theme.colors.surfaceSunken, foreground: theme.colors.textMuted },
    primary: { background: theme.colors.primarySoft, foreground: theme.colors.primary },
    accent: { background: theme.colors.accentSoft, foreground: theme.colors.accent },
    success: { background: theme.colors.successSoft, foreground: theme.colors.success },
    warning: { background: theme.colors.warningSoft, foreground: theme.colors.warning },
    danger: { background: theme.colors.dangerSoft, foreground: theme.colors.danger },
  };

  const { background, foreground } = palette[tone];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: background,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          gap: theme.spacing.xs,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={12} color={foreground} />}
      <Text variant="micro" color={foreground} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
