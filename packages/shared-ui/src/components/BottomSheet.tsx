import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned below the scrollable body — where the confirm action belongs. */
  footer?: ReactNode;
  /** Fraction of the screen height the sheet may grow to. */
  maxHeightRatio?: number;
  scrollable?: boolean;
}

/**
 * The 2026 default container for secondary content: filters, quantity pickers,
 * address forms. It keeps the user on the list they were browsing instead of
 * pushing a whole screen, and its actions land in the thumb zone.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  maxHeightRatio = 0.86,
  scrollable = true,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? theme.motion.base : theme.motion.fast,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress, theme.motion]);

  // Android's hardware back should close the sheet, not the screen behind it.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.4, 0] });
  const body = <View style={{ gap: theme.spacing.md }}>{children}</View>;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrapper}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              theme.shadows.lg,
              {
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: theme.radius.xxl,
                borderTopRightRadius: theme.radius.xxl,
                maxHeight: height * maxHeightRatio,
                paddingBottom: insets.bottom + theme.spacing.lg,
                transform: [{ translateY }],
                opacity: progress,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

            {title && (
              <View style={[styles.header, { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md }]}>
                <Text variant="h3" style={{ flex: 1 }}>
                  {title}
                </Text>
                <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="إغلاق">
                  <Ionicons name="close" size={22} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            )}

            {scrollable ? (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {body}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>{body}</View>
            )}

            {footer && (
              <View
                style={[
                  styles.footer,
                  {
                    paddingHorizontal: theme.spacing.xl,
                    paddingTop: theme.spacing.md,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                {footer}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    paddingTop: 8,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
