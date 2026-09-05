import {
  Badge,
  Button,
  Card,
  Divider,
  Screen,
  ScreenHeader,
  Text,
  usePaymentMethods,
  useApi,
  useTheme,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { API_URL, APP } from '../../config';

export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, isSignedIn, signOut } = useApi();
  const paymentMethods = usePaymentMethods();

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title="حسابي" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isSignedIn && user ? (
          <Card appearance="outlined" style={{ gap: theme.spacing.md }}>
            <View style={[styles.row, { gap: theme.spacing.md }]}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.pill },
                ]}
              >
                <Text variant="h2" color={theme.colors.primary}>
                  {(user.fullName ?? user.email).slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3" numberOfLines={1}>
                  {user.fullName ?? 'حسابي'}
                </Text>
                <Text variant="caption" muted numberOfLines={1} style={styles.ltr}>
                  {user.email}
                </Text>
              </View>
            </View>

            {user.phone && (
              <>
                <Divider />
                <View style={{ gap: theme.spacing.xs }}>
                  <InfoRow label="الهاتف" value={user.phone} />
                </View>
              </>
            )}

            <Badge label="حساب تسوّق" tone="primary" icon="person-outline" />
          </Card>
        ) : (
          <Card appearance="outlined" style={{ gap: theme.spacing.md }}>
            <Text variant="h3">لم تسجّل الدخول بعد</Text>
            <Text variant="body" muted>
              سجّل الدخول أو أنشئ حساباً لإتمام طلبك وتتبّع شحناتك.
            </Text>
            <Button label="تسجيل الدخول / إنشاء حساب" onPress={() => router.push('/sign-in')} fullWidth />
          </Card>
        )}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">الدعم</Text>
          <Card appearance="outlined" padding="none" style={{ overflow: 'hidden' }}>
            <MenuRow
              icon="mail-outline"
              label="راسلنا"
              value={APP.supportEmail}
              onPress={() => void Linking.openURL(`mailto:${APP.supportEmail}`)}
            />
            <Divider />
            <MenuRow
              icon="card-outline"
              label="طريقة الدفع"
              value={
                paymentMethods.data
                  ? `${paymentMethods.data.active.toUpperCase()} · بطاقة مسبقة الدفع`
                  : 'جارٍ التحميل…'
              }
            />
            <Divider />
            <MenuRow icon="server-outline" label="الخادم" value={API_URL} />
            <Divider />
            <MenuRow
              icon="information-circle-outline"
              label="الإصدار"
              value={`${Constants.expoConfig?.version ?? '1.0.0'} (${APP.name})`}
            />
          </Card>
        </View>

        {isSignedIn && (
          <Button label="تسجيل الخروج" variant="outline" icon="log-out-outline" onPress={confirmSignOut} fullWidth />
        )}
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.spread, { gap: theme.spacing.md }]}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="caption">{value}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.menuRow,
        { padding: theme.spacing.lg, gap: theme.spacing.md, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.textMuted} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="micro" muted numberOfLines={1} style={{ maxWidth: 170 }}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spread: {
    justifyContent: 'space-between',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ltr: {
    writingDirection: 'ltr',
  },
});
