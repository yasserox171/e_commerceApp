import {
  ApiRequestError,
  Badge,
  Button,
  Card,
  Chip,
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
  useTheme,
  type PaymentMethod,
  type ShippingAddress,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

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

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint: string; icon: 'card-outline' | 'business-outline' }> = [
  {
    value: 'card',
    label: 'بطاقة بنكية',
    hint: 'دفع مسبق آمن عبر CMI — يؤكَّد الطلب فوراً.',
    icon: 'card-outline',
  },
  {
    value: 'bank_transfer',
    label: 'تحويل بنكي',
    hint: 'يراجع فريق المبيعات الطلب ويرسل لك تفاصيل التحويل.',
    icon: 'business-outline',
  },
];

/**
 * Wholesale checkout.
 *
 * Unlike the retail app, a wholesale buyer may settle by bank transfer — the
 * order then waits on sales approval instead of a gateway callback. Card is
 * still the default because it confirms the order immediately.
 */
export default function ReviewOrderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useApi();
  const { data: cart } = useCart();
  const createOrder = useCreateOrder();

  const [address, setAddress] = useState<AddressDraft>({
    ...EMPTY_ADDRESS,
    fullName: user?.businessName ?? user?.fullName ?? '',
    phone: user?.phone ?? '',
  });
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [errors, setErrors] = useState<Partial<Record<keyof AddressDraft | 'form', string>>>({});

  // The session restores asynchronously, so `user` is usually null on the first
  // render and the initial state above prefills nothing. Backfill once it
  // arrives — but only fields the customer has not already typed into.
  useEffect(() => {
    if (!user) return;
    setAddress((current) => ({
      ...current,
      fullName: current.fullName || user.businessName || user.fullName || '',
      phone: current.phone || user.phone || '',
    }));
  }, [user]);

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

  const submit = () => {
    if (!validate()) return;

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
        paymentMethod,
      },
      {
        onSuccess: (order) => {
          // Replace so the hardware back button lands on the orders list, not
          // back on a checkout form for an order that already exists.
          router.replace({ pathname: '/order/[id]', params: { id: order.id } });
        },
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

  if (!cart || cart.lines.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="مراجعة الطلب" onBack={() => router.back()} />
        <EmptyState
          icon="clipboard-outline"
          title="الطلبية فارغة"
          description="أضف منتجات قبل إتمام الطلب."
          actionLabel="تصفح الكتالوج"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="مراجعة الطلب"
        subtitle={`${formatItemCount(cart.itemCount)} · ${cart.unitCount} وحدة`}
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
            <Text variant="h3">عنوان التسليم</Text>

            <TextField
              label="اسم المستلم / الشركة"
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
              placeholder="الطابق، المستودع، علامة مميزة"
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
            <Text variant="h3">طريقة الدفع</Text>

            <View style={[styles.row, { gap: theme.spacing.sm }]}>
              {PAYMENT_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  icon={option.icon}
                  selected={paymentMethod === option.value}
                  onPress={() => setPaymentMethod(option.value)}
                />
              ))}
            </View>

            <Text variant="caption" muted>
              {PAYMENT_OPTIONS.find((option) => option.value === paymentMethod)?.hint}
            </Text>

            <Badge label="لا يتوفر الدفع عند الاستلام" tone="neutral" icon="close-circle-outline" />
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="h3">ملاحظة للمورّد (اختياري)</Text>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder="تعليمات التغليف، موعد التسليم المفضل…"
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
                الشحن
              </Text>
              <Text variant="callout">يُحدَّد مع المورّد</Text>
            </View>
            <Divider />
            <View style={[styles.row, styles.spread]}>
              <Text variant="h3">الإجمالي</Text>
              <Price value={cart.subtotal} variant="priceLarge" color={theme.colors.primary} />
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
            label={paymentMethod === 'card' ? 'إنشاء الطلب والانتقال للدفع' : 'إرسال الطلب للمراجعة'}
            size="lg"
            fullWidth
            loading={createOrder.isPending}
            onPress={submit}
          />

          <View style={[styles.row, { gap: theme.spacing.sm, justifyContent: 'center' }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.textSubtle} />
            <Text variant="micro" muted>
              تُحسب الأسعار من الكتالوج مباشرة عند إنشاء الطلب
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
