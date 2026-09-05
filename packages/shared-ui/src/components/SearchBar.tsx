import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { rtl } from '../i18n/rtl';
import { useTheme } from '../theme/ThemeProvider';

export interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Milliseconds to wait after the last keystroke before `onSubmit` fires. */
  debounceMs?: number;
  onSubmit?: (value: string) => void;
  onFilterPress?: () => void;
  /** Shows a dot on the filter button when any filter is applied. */
  filterActive?: boolean;
  autoFocus?: boolean;
  style?: ViewStyle;
}

/**
 * Debounced so typing "قميص" fires one request instead of four. The debounce
 * lives here rather than in each screen because every catalogue search in both
 * apps wants exactly this behaviour.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'ابحث عن منتج…',
  debounceMs = 350,
  onSubmit,
  onFilterPress,
  filterActive = false,
  autoFocus = false,
  style,
}: SearchBarProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleChange = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChangeText(next);
      onSubmit?.(next);
    }, debounceMs);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setDraft('');
    onChangeText('');
    onSubmit?.('');
  };

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }, style]}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={theme.colors.textSubtle} />
        <TextInput
          value={draft}
          onChangeText={handleChange}
          onSubmitEditing={() => {
            if (timer.current) clearTimeout(timer.current);
            onChangeText(draft);
            onSubmit?.(draft);
          }}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSubtle}
          returnKeyType="search"
          autoFocus={autoFocus}
          autoCorrect={false}
          accessibilityLabel="حقل البحث"
          style={[
            theme.typography.body,
            styles.input,
            { color: theme.colors.text, textAlign: rtl.textAlign() },
          ]}
        />
        {draft.length > 0 && (
          <Pressable onPress={clear} hitSlop={8} accessibilityRole="button" accessibilityLabel="مسح البحث">
            <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {onFilterPress && (
        <Pressable
          onPress={onFilterPress}
          accessibilityRole="button"
          accessibilityLabel="الفلاتر"
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: filterActive ? theme.colors.primary : theme.colors.surface,
              borderColor: filterActive ? theme.colors.primary : theme.colors.border,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filterActive ? theme.colors.onPrimary : theme.colors.text}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  field: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
  },
  filterButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
