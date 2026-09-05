import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface QuantityStepperProps {
  value: number;
  onChange: (quantity: number) => void;
  /** Wholesale minimum order quantity. Decrementing stops here. */
  min?: number;
  max?: number;
  /** Increment size — wholesale often sells in cartons of 6, 12, 24. */
  step?: number;
  size?: 'sm' | 'md';
  /** Lets a wholesale buyer type 240 instead of tapping + forty times. */
  editable?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 100_000,
  step = 1,
  size = 'md',
  editable = true,
  disabled = false,
  style,
}: QuantityStepperProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(String(value));

  // Keep the field in sync when the value changes from outside (a tier jump, a
  // server-corrected quantity) without fighting the user mid-typing.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [max, min],
  );

  const nudge = useCallback(
    (delta: number) => {
      const next = clamp(value + delta);
      if (next === value) return;
      void Haptics.selectionAsync();
      onChange(next);
    },
    [clamp, onChange, value],
  );

  const commitDraft = useCallback(() => {
    const parsed = Number.parseInt(draft.replace(/[^\d]/g, ''), 10);
    const next = Number.isFinite(parsed) ? clamp(parsed) : min;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }, [clamp, draft, min, onChange, value]);

  const dimensions = size === 'sm' ? { button: 32, field: 44, icon: 16 } : { button: 40, field: 56, icon: 18 };
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius: theme.radius.md,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <StepButton
        icon="remove"
        size={dimensions}
        disabled={disabled || atMin}
        onPress={() => nudge(-step)}
        accessibilityLabel="إنقاص الكمية"
      />

      {editable ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          keyboardType="number-pad"
          returnKeyType="done"
          editable={!disabled}
          selectTextOnFocus
          accessibilityLabel="الكمية"
          style={[
            theme.typography.bodyStrong,
            styles.field,
            { width: dimensions.field, color: theme.colors.text },
          ]}
        />
      ) : (
        <View style={{ width: dimensions.field }}>
          <Text variant="bodyStrong" align="center">
            {value}
          </Text>
        </View>
      )}

      <StepButton
        icon="add"
        size={dimensions}
        disabled={disabled || atMax}
        onPress={() => nudge(step)}
        accessibilityLabel="زيادة الكمية"
      />
    </View>
  );
}

function StepButton({
  icon,
  size,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: 'add' | 'remove';
  size: { button: number; icon: number };
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.stepButton,
        {
          width: size.button,
          height: size.button,
          backgroundColor: pressed ? theme.colors.primarySoft : 'transparent',
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={size.icon}
        color={disabled ? theme.colors.textSubtle : theme.colors.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  stepButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    textAlign: 'center',
    paddingVertical: 0,
  },
});
