import {
  ApiRequestError,
  Badge,
  BottomSheet,
  Button,
  Card,
  CheckoutWebView,
  Divider,
  EmptyState,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  Price,
  ProductImage,
  Screen,
  ScreenHeader,
  Skeleton,
  StatusTimeline,
  Text,
  formatDateTime,
  formatItemCount,
  orderStatusLabel,
  orderStatusTone,
  useCancelOrder,
  useOrder,
  useStartCheckout,
  useTheme,
  type CheckoutResultStatus,
  type CheckoutSession,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

export default function OrderDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const startCheckout = useStartCheckout();
  const cancelOrder = useCancelOrder();

  const [session, setSession] = useState<CheckoutSession | null>(null);

  const pay = () => {
    if (!order) return;
    startCheckout.mutate(order.id, {
      onSuccess: setSession,
      onError: (error) => {
        Alert.alert(
          'تعذر بدء الدفع',
          error instanceof ApiRequestError ? error.message : 'حدث خطأ غير متوقع.',
        );
      },
    });
  };

  const handleCheckoutResult = ({ status }: { status: CheckoutResultStatus }) => {
    setSession(null);
    // The gateway's server-to-server callback is what actually settles the
    // order, and it can land a moment after the browser returns — refetch
    // rather than trusting the redirect's own claim.
    void refetch();

    if (status === 'success') {
      Alert.alert('تم الدفع', 'تم استلام الدفع بنجاح. سنبدأ تجهيز طلبك.');
    } else if (status === 'cancelled') {
      Alert.alert('أُلغي الدفع', 'لم يتم خصم أي مبلغ. يمكنك المحاولة لاحقاً.');
    } else if (status === 'failed') {
      Alert.alert('فشل الدفع', 'لم تنجح العملية. جرّب بطاقة أخرى.');
    }
  };

  const confirmCancel = () => {
    if (!order) return;
    Alert.alert('إلغاء الطلب', `سيتم إلغاء الطلب ${order.reference}. هل أنت متأكد؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء الطلب',
        style: 'destructive',
        onPress: () =>
          cancelOrder.mutate(order.id, {
            onError: (error) =>
              Alert.alert(
                'تعذر الإلغاء',
                error instanceof ApiRequestError ? error.message : 'حدث خطأ.',
              ),
          }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => router.back()} />
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
          <Skeleton width="50%" height={24} />
          <Skeleton width="100%" height={180} radius={theme.radius.lg} />
          <Skeleton width="100%" height={120} radius={theme.radius.lg} />
        </View>
      </Screen>
    );
  }

  if (isError || !order) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => router.back()} />
        <EmptyState
          icon="alert-circle-outline"
          tone="error"
          title="تعذر تحميل الطلب"
          actionLabel="إعادة المحاولة"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  const presentation = ORDER_STATUS_LABELS[order.status];
  const canPay = order.status === 'pending_payment' && order.paymentMethod === 'card';
  const canCancel = order.status === 'pending_payment' || order.status === 'awaiting_approval';
  const lastPayment = order.payments.at(-1) ?? null;

  return (
    <Screen>
      <ScreenHeader
        title={order.reference}
        subtitle={formatDateTime(order.createdAt)}
        onBack={() => router.back()}
        action={<Badge label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card appearance="outlined" style={{ gap: theme.spacing.md }}>
          <Text variant="body" color={theme.colors.textMuted}>
            {presentation.description}
          </Text>

          {canPay && (
            <Button
              label="ادفع الآن بالبطاقة"
              icon="card-outline"
              size="lg"
              fullWidth
              loading={startCheckout.isPending}
              onPress={pay}
            />
          )}

          {lastPayment?.failureReason && order.status === 'pending_payment' && (
            <View
              style={{
                backgroundColor: theme.colors.dangerSoft,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
              }}
            >
              <Text variant="caption" color={theme.colors.danger}>
                آخر محاولة دفع فشلت: {lastPayment.failureReason}
              </Text>
            </View>
          )}
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h3">تتبع الطلب</Text>
          <StatusTimeline status={order.status} events={order.events} />
        </View>

        {order.trackingNumber && (
          <Card appearance="outlined" style={{ gap: theme.spacing.xs }}>
            <Text variant="callout" muted>
              رقم التتبع
            </Text>
            <Text variant="bodyStrong" style={styles.ltr}>
              {order.trackingNumber}
            </Text>
            {order.trackingCarrier && (
              <Text variant="caption" muted>
                شركة الشحن: {order.trackingCarrier}
              </Text>
            )}
          </Card>
        )}

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h3">المنتجات ({formatItemCount(order.itemCount)})</Text>

          <Card appearance="outlined" style={{ gap: theme.spacing.md }}>
            {order.items.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <Divider />}
                <View style={[styles.row, { gap: theme.spacing.md }]}>
                  <ProductImage uri={item.imageUrl} radius={theme.radius.sm} style={{ width: 56 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="callout" numberOfLines={2}>
                      {item.title}
                    </Text>
                    {/* Price renders a View, so it sits beside the text rather
                        than nested inside it. */}
                    <View style={[styles.row, { gap: theme.spacing.xs }]}>
                      <Text variant="micro" muted>
                        {item.quantity} ×
                      </Text>
                      <Price value={item.unitPrice} variant="caption" color={theme.colors.textMuted} />
                    </View>
                  </View>
                  <Price value={item.lineTotal} variant="bodyStrong" />
                </View>
              </React.Fragment>
            ))}
          </Card>
        </View>

        <Card appearance="outlined" style={{ gap: theme.spacing.sm }}>
          <SummaryRow label="المجموع الفرعي" value={order.subtotal} />
          {order.shippingTotal > 0 && <SummaryRow label="الشحن" value={order.shippingTotal} />}
          {order.discountTotal > 0 && <SummaryRow label="الخصم" value={-order.discountTotal} />}
          <Divider />
          <View style={[styles.row, styles.spread]}>
            <Text variant="h3">الإجمالي</Text>
            <Price value={order.total} variant="priceLarge" color={theme.colors.primary} />
          </View>
          <Text variant="micro" muted>
            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
          </Text>
        </Card>

        {order.shippingAddress && (
          <Card appearance="outlined" style={{ gap: theme.spacing.xs }}>
            <View style={[styles.row, { gap: theme.spacing.sm }]}>
              <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
              <Text variant="callout" muted>
                عنوان التسليم
              </Text>
            </View>
            <Text variant="body">{order.shippingAddress.fullName}</Text>
            <Text variant="caption" muted>
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `، ${order.shippingAddress.line2}` : ''}
            </Text>
            <Text variant="caption" muted>
              {order.shippingAddress.city}
              {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ''}
            </Text>
            <Text variant="caption" muted style={styles.ltr}>
              {order.shippingAddress.phone}
            </Text>
          </Card>
        )}

        {order.customerNote && (
          <Card appearance="outlined" style={{ gap: theme.spacing.xs }}>
            <Text variant="callout" muted>
              ملاحظتك
            </Text>
            <Text variant="body">{order.customerNote}</Text>
          </Card>
        )}

        {canCancel && (
          <Button
            label="إلغاء الطلب"
            variant="outline"
            icon="close-circle-outline"
            fullWidth
            loading={cancelOrder.isPending}
            onPress={confirmCancel}
          />
        )}
      </ScrollView>

      {/* The card form lives on the gateway's own page inside this sheet. */}
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
              onResult={handleCheckoutResult}
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

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={[styles.row, styles.spread]}>
      <Text variant="callout" muted>
        {label}
      </Text>
      <Price value={value} variant="callout" />
    </View>
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
  ltr: {
    writingDirection: 'ltr',
  },
});
