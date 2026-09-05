import {
  ApiRequestError,
  Badge,
  BottomSheet,
  Button,
  Card,
  CheckoutWebView,
  Divider,
  EmptyState,
  Price,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  formatItemCount,
  useApi,
  useCart,
  useCreateOrder,
  usePaymentMethods,
  useStartCheckout,
  useTheme,
  type CheckoutResultStatus,
  type CheckoutSession,
  type ShippingAddress,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

type AddressDraft = Omit<ShippingAddress, 'countryCode'>;

const EMPTY_ADDRESS: AddressDraft = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
};

/**
 * Retail checkout — prepaid card only.
 *
 * There is no payment-method picker here on purpose: the API rejects anything
 * but `card` for this channel and the database has no way to represent cash on
 * delivery, so offering the choice would only be a dead end. The card itself is
 * entered on the gateway's page inside the WebView; nothing sensitive touches
 * this app.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useApi();
  const { data: cart } = useCart();
  const paymentMethods = usePaymentMethods();

  const createOrder = useCreateOrder();
  const startCheckout = useStartCheckout();

  const [address, setAddress] = useState<AddressDraft>({
    ...EMPTY_ADDRESS,
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
  });
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof AddressDraft | 'form', string>>>({});
  const [session, setSession] = useState<CheckoutSession | null>(null);
  // Kept so a failed payment can be retried without recreating the order.
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  // The session restores asynchronously, so `user` is usually null on the first
  // render and the initial state above prefills nothing. Backfill once it
  // arrives — but only fields the customer has not already typed into.
  useEffect(() => {
    if (!user) return;
    setAddress((current) => ({
      ...current,
      fullName: current.fullName || user.fullName || '',
      phone: current.phone || user.phone || '',
    }));
  }, [user]);

  const busy = createOrder.isPending || startCheckout.isPending;

  const update = (key: keyof AddressDraft, value: string) =>
    setAddress((current) => ({ ...current, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof AddressDraft, string>> = {};
    if (address.fullName.trim().length < 2) next.fullName = 'مطلوب';
    if (address.phone.trim().length < 6) next.phone = 'رقم هاتف غير صالح';
    if (address.line1.trim().length < 4) next.line1 = 'أدخل العنوان بالتفصيل';
    if (address.city.trim().length < 2) next.city = 'مطلوب';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const openGateway = (orderId: string) => {
    setPendingOrderId(orderId);
    startCheckout.mutate(orderId, {
      onSuccess: setSession,
      onError: (error) => {
        // The order exists and is payable; the gateway just could not be
        // reached. Send the shopper to it so they can retry there.
        Alert.alert(
          'تعذر فتح صفحة الدفع',
          error instanceof ApiRequestError ? error.message : 'حدث خطأ غير متوقع.',
          [
            { text: 'حسناً', style: 'cancel' },
            {
              text: 'عرض الطلب',
              onPress: () => router.replace({ pathname: '/order/[id]', params: { id: orderId } }),
            },
          ],
        );
      },
    });
  };

  const submit = () => {
    if (!validate()) return;

    if (pendingOrderId) {
      // Retrying after a declined card — don't create a second order.
      openGateway(pendingOrderId);
      return;
    }

    createOrder.mutate(
      {
        shippingAddress: {
          fullName: address.fullName.trim(),
          phone: address.phone.trim(),
          line1: address.line1.trim(),
          ...(address.line2?.trim() ? { line2: address.line2.trim() } : {}),
          city: address.city.trim(),
          ...(address.region?.trim() ? { region: address.region.trim() } : {}),
          ...(address.postalCode?.trim() ? { postalCode: address.postalCode.trim() } : {}),
          countryCode: 'MA',
        },
        ...(note.trim() ? { customerNote: note.trim() } : {}),
        paymentMethod: 'card',
      },
      {
        onSuccess: (order) => openGateway(order.id),
        onError: (error) => {
          setErrors({
            form:
              error instanceof ApiRequestError
                ? [error.message, ...(Array.isArray(error.details) ? (error.details as string[]) : [])].join('\n')
                : 'تعذر إنشاء الطلب.',
          });
        },
      },
    );
  };

  const handleResult = ({ status }: { status: CheckoutResultStatus }) => {
    setSession(null);
    const orderId = pendingOrderId;

    if (status === 'success' || status === 'unverified') {
      if (orderId) router.replace({ pathname: '/order/[id]', params: { id: orderId } });
      return;
    }

    Alert.alert(
      status === 'cancelled' ? 'أُلغي الدفع' : 'لم ينجح الدفع',
      status === 'cancelled'
        ? 'لم يتم خصم أي مبلغ. طلبك محفوظ ويمكنك إتمام الدفع في أي وقت.'
        : 'لم تُقبل البطاقة. جرّب بطاقة أخرى.',
      [
        { text: 'إعادة المحاولة', onPress: () => orderId && openGateway(orderId) },
        {
          text: 'عرض الطلب',
          style: 'cancel',
          onPress: () => orderId && router.replace({ pathname: '/order/[id]', params: { id: orderId } }),
        },
      ],
    );
  };

  if (!cart || cart.lines.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="إتمام الشراء" onBack={() => router.back()} />
        <EmptyState
          icon="bag-outline"
          title="السلة فارغة"
          description="أضف منتجات قبل إتمام الشراء."
          actionLabel="تسوّق الآن"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const shipping = 0;
  const total = cart.subtotal + shipping;

  return (
    <Screen>
      <ScreenHeader
        title="إتمام الشراء"
        subtitle={`${formatItemCount(cart.itemCount)} · ${cart.unitCount} قطعة`}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.huge,
            gap: theme.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="h3">عنوان التوصيل</Text>

            <TextField
              label="الاسم الكامل"
              icon="person-outline"
              value={address.fullName}
              onChangeText={(value) => update('fullName', value)}
              error={errors.fullName ?? null}
            />
            <TextField
              label="رقم الهاتف"
              icon="call-outline"
              keyboardType="phone-pad"
              value={address.phone}
              onChangeText={(value) => update('phone', value)}
              error={errors.phone ?? null}
              placeholder="+212 6 00 00 00 00"
              hint="سيتصل بك المندوب على هذا الرقم"
            />
            <TextField
              label="العنوان"
              icon="location-outline"
              value={address.line1}
              onChangeText={(value) => update('line1', value)}
              error={errors.line1 ?? null}
              placeholder="الشارع، الرقم، الحي"
            />
            <TextField
              label="تفاصيل إضافية (اختياري)"
              value={address.line2 ?? ''}
              onChangeText={(value) => update('line2', value)}
              placeholder="الطابق، الشقة، علامة مميزة"
            />

            <View style={[styles.row, { gap: theme.spacing.md }]}>
              <TextField
                label="المدينة"
                value={address.city}
                onChangeText={(value) => update('city', value)}
                error={errors.city ?? null}
                containerStyle={styles.flex}
              />
              <TextField
                label="الرمز البريدي"
                keyboardType="number-pad"
                value={address.postalCode ?? ''}
                onChangeText={(value) => update('postalCode', value)}
                containerStyle={styles.flex}
              />
            </View>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="h3">الدفع</Text>

            <Card appearance="outlined" style={{ gap: theme.spacing.sm }}>
              <View style={[styles.row, { gap: theme.spacing.md }]}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.md },
                  ]}
                >
                  <Ionicons name="card-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">بطاقة بنكية (Visa / Mastercard)</Text>
                  <Text variant="micro" muted>
                    عبر {(paymentMethods.data?.active ?? 'CMI').toUpperCase()} — صفحة دفع آمنة بـ 3D Secure
                  </Text>
                </View>
              </View>

              <Divider />

              <View style={[styles.row, { gap: theme.spacing.sm }]}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
                <Text variant="micro" muted style={{ flex: 1 }}>
                  الدفع مسبق بالكامل. لا نوفّر الدفع عند الاستلام.
                </Text>
              </View>
            </Card>

            <Badge label="بياناتك البنكية لا تمر عبر التطبيق" tone="success" icon="shield-checkmark-outline" />
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="h3">ملاحظة (اختياري)</Text>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder="تعليمات التوصيل، وقت مناسب…"
              multiline
              numberOfLines={3}
            />
          </View>

          <Card appearance="outlined" style={{ gap: theme.spacing.sm }}>
            <View style={[styles.row, styles.spread]}>
              <Text variant="callout" muted>
                المجموع الفرعي
              </Text>
              <Price value={cart.subtotal} variant="bodyStrong" />
            </View>
            <View style={[styles.row, styles.spread]}>
              <Text variant="callout" muted>
                التوصيل
              </Text>
              <Text variant="callout" color={theme.colors.success}>
                {shipping === 0 ? 'مجاني' : ''}
              </Text>
            </View>
            <Divider />
            <View style={[styles.row, styles.spread]}>
              <Text variant="h3">الإجمالي</Text>
              <Price value={total} variant="priceLarge" color={theme.colors.primary} />
            </View>
          </Card>

          {errors.form && (
            <View style={{ backgroundColor: theme.colors.dangerSoft, padding: theme.spacing.md, borderRadius: theme.radius.md }}>
              <Text variant="caption" color={theme.colors.danger}>
                {errors.form}
              </Text>
            </View>
          )}

          <Button
            label={pendingOrderId ? 'إعادة محاولة الدفع' : 'الدفع الآن بالبطاقة'}
            icon="lock-closed"
            size="lg"
            fullWidth
            loading={busy}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={session !== null}
        onClose={() => setSession(null)}
        title="الدفع الآمن"
        scrollable={false}
        maxHeightRatio={0.92}
      >
        <View style={{ height: 520 }}>
          {session && (
            <CheckoutWebView
              session={session}
              onResult={handleResult}
              onError={(message) => {
                setSession(null);
                Alert.alert('خطأ في صفحة الدفع', message);
              }}
            />
          )}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spread: {
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
