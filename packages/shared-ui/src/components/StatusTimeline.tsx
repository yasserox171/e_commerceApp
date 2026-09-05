import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { formatDateTime } from '../i18n/format';
import { useTheme } from '../theme/ThemeProvider';
import type { OrderEvent, OrderStatus } from '../types';
import { Text } from './Text';

export interface StatusStep {
  status: OrderStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * The happy path a shopper is tracking. Terminal states (cancelled, refunded)
 * are not steps — they replace the timeline, because a cancelled order never
 * reaches "delivered" and showing greyed-out future steps just reads as broken.
 */
export const ORDER_STEPS: StatusStep[] = [
  { status: 'pending_payment', label: 'في انتظار الدفع', icon: 'card-outline' },
  { status: 'processing', label: 'قيد المعالجة', icon: 'cube-outline' },
  { status: 'shipped', label: 'تم الشحن', icon: 'airplane-outline' },
  { status: 'delivered', label: 'تم التسليم', icon: 'checkmark-done-outline' },
];

const TERMINAL: Partial<Record<OrderStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  cancelled: { label: 'أُلغي الطلب', icon: 'close-circle-outline' },
  refunded: { label: 'تم استرجاع المبلغ', icon: 'return-down-back-outline' },
  awaiting_approval: { label: 'في انتظار موافقة المبيعات', icon: 'time-outline' },
};

export interface StatusTimelineProps {
  status: OrderStatus;
  /** Server-recorded history, used to date each completed step. */
  events?: OrderEvent[];
  style?: ViewStyle;
}

export function StatusTimeline({ status, events = [], style }: StatusTimelineProps) {
  const theme = useTheme();

  const terminal = TERMINAL[status];
  if (terminal) {
    const tone = status === 'awaiting_approval' ? theme.colors.warning : theme.colors.danger;
    // Most recent event for this status — the order may have entered it twice.
    const event = [...events].reverse().find((entry) => entry.status === status) ?? null;

    return (
      <View style={[styles.terminal, { gap: theme.spacing.md, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceAlt }, style]}>
        <Ionicons name={terminal.icon} size={24} color={tone} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="bodyStrong" color={tone}>
            {terminal.label}
          </Text>
          {event && (
            <Text variant="caption" color={theme.colors.textMuted}>
              {formatDateTime(event.createdAt)}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const currentIndex = ORDER_STEPS.findIndex((step) => step.status === status);

  return (
    <View style={[{ gap: theme.spacing.none }, style]}>
      {ORDER_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const reached = done || active;
        const event = events.find((entry) => entry.status === step.status) ?? null;

        const dotColor = active
          ? theme.colors.primary
          : done
            ? theme.colors.success
            : theme.colors.border;

        return (
          <View key={step.status} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: reached ? dotColor : theme.colors.surface,
                    borderColor: dotColor,
                    borderRadius: theme.radius.pill,
                  },
                ]}
              >
                <Ionicons
                  name={done ? 'checkmark' : step.icon}
                  size={14}
                  color={reached ? theme.colors.onPrimary : theme.colors.textSubtle}
                />
              </View>
              {index < ORDER_STEPS.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: done ? theme.colors.success : theme.colors.border },
                  ]}
                />
              )}
            </View>

            <View style={{ flex: 1, paddingBottom: theme.spacing.xl, gap: theme.spacing.xxs }}>
              <Text
                variant={active ? 'bodyStrong' : 'body'}
                color={reached ? theme.colors.text : theme.colors.textSubtle}
              >
                {step.label}
              </Text>
              {event ? (
                <Text variant="caption" color={theme.colors.textMuted}>
                  {formatDateTime(event.createdAt)}
                  {event.note ? ` · ${event.note}` : ''}
                </Text>
              ) : (
                active && (
                  <Text variant="caption" color={theme.colors.textMuted}>
                    جارٍ…
                  </Text>
                )
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    alignItems: 'center',
    width: 28,
  },
  dot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  connector: {
    flex: 1,
    width: 2,
    marginVertical: 2,
  },
  terminal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
