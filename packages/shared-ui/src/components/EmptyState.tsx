import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider.js';
import { Button } from './Button.js';
import { Text } from './Text.js';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
  style?: ViewStyle;
}

/**
 * One component for "no results", "cart is empty" and "the request failed".
 * They differ only in copy and tone, and sharing them means a network error
 * never renders as a blank screen with no way forward.
 */
export function EmptyState({
  icon = 'cube-outline',
  title,
  description,
  actionLabel,
  onAction,
  tone = 'neutral',
  style,
}: EmptyStateProps) {
  const theme = useTheme();
  const accent = tone === 'error' ? theme.colors.danger : theme.colors.textSubtle;

  return (
    <View style={[styles.container, { padding: theme.spacing.xxl, gap: theme.spacing.md }, style]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: tone === 'error' ? theme.colors.dangerSoft : theme.colors.surfaceSunken,
            borderRadius: theme.radius.pill,
          },
        ]}
      >
        <Ionicons name={icon} size={30} color={accent} />
      </View>

      <Text variant="h3" align="center">
        {title}
      </Text>

      {description && (
        <Text variant="body" color={theme.colors.textMuted} align="center">
          {description}
        </Text>
      )}

      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          variant={tone === 'error' ? 'primary' : 'secondary'}
          onPress={onAction}
          style={{ marginTop: theme.spacing.sm }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
