import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { rtl } from '../i18n/rtl';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Adds a show/hide toggle and starts obscured. */
  secure?: boolean;
  containerStyle?: ViewStyle;
}

export function TextField({
  label,
  error,
  hint,
  icon,
  secure = false,
  containerStyle,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label && (
        <Text variant="callout" color={theme.colors.textMuted}>
          {label}
        </Text>
      )}

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}
      >
        {icon && <Ionicons name={icon} size={18} color={theme.colors.textSubtle} />}

        <TextInput
          {...props}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={theme.colors.textSubtle}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.typography.body,
            styles.input,
            {
              color: theme.colors.text,
              // Email and phone read wrong mirrored; everything else follows
              // the app's RTL direction.
              textAlign:
                props.keyboardType === 'email-address' || props.keyboardType === 'phone-pad'
                  ? 'left'
                  : rtl.textAlign(),
            },
          ]}
        />

        {secure && (
          <Ionicons
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.textSubtle}
            onPress={() => setRevealed((current) => !current)}
            suppressHighlighting
          />
        )}
      </View>

      {(error || hint) && (
        <Text variant="micro" color={error ? theme.colors.danger : theme.colors.textSubtle}>
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
  },
});
