import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, count, onPress, onRemove, icon, style }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.xs,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={14} color={selected ? theme.colors.onPrimary : theme.colors.textMuted} />
      )}

      <Text variant="callout" color={selected ? theme.colors.onPrimary : theme.colors.text} numberOfLines={1}>
        {label}
      </Text>

      {count !== undefined && (
        <Text variant="micro" color={selected ? theme.colors.onPrimary : theme.colors.textSubtle}>
          {count}
        </Text>
      )}

      {onRemove && (
        <Ionicons
          name="close"
          size={14}
          color={selected ? theme.colors.onPrimary : theme.colors.textMuted}
          onPress={onRemove}
          suppressHighlighting
        />
      )}
    </Pressable>
  );
}

export interface ChipRowProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Horizontally scrolling row of chips — the standard filter affordance. */
export function ChipRow({ children, style }: ChipRowProps) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
        style,
      ]}
    >
      <View style={[styles.row, { gap: theme.spacing.sm }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
