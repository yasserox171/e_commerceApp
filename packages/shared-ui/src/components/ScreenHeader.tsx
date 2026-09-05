import { Ionicons } from '@expo/vector-icons';
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { rtl } from '../i18n/rtl.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { Text } from './Text.js';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Rendered at the opposite end from the back button. */
  action?: ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({ title, subtitle, onBack, action, style }: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {/* Mirrors with the layout: "back" points right in an RTL app. */}
          <Ionicons name={rtl.forwardChevron()} size={20} color={theme.colors.text} />
        </Pressable>
      )}

      <View style={styles.titles}>
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
});
