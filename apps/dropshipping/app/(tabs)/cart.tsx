import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRowSkeleton,
  Price,
  ProductImage,
  QuantityStepper,
  Screen,
  ScreenHeader,
  Text,
  formatItemCount,
  useCart,
  useCartMutations,
  useTheme,
  type CartLine,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AuthGate } from '../../components/AuthGate';

export default function CartScreen() {
  return (
    <AuthGate title="السلة" reason="سجّل الدخول لحفظ سلتك وإتمام الشراء.">
      <CartContent />
    </AuthGate>
  );
}

function CartContent() {
  const theme = useTheme();
  const router = useRouter();
  const { data: cart, isLoading, isError, refetch } = useCart();
  const { updateQuantity, removeItem, clear } = useCartMutations();

  const lines = cart?.lines ?? [];
  const blocked = (cart?.issues.length ?? 0) > 0;

  const confirmClear = () => {
    Alert.alert('إفراغ السلة', 'سيتم حذف كل المنتجات من السلة. متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إفراغ', style: 'destructive', onPress: () => clear.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="السلة" />
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <ListRowSkeleton key={index} />
          ))}
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="السلة" />
        <EmptyState
          icon="cloud-offline-outline"
          tone="error"
          title="تعذر تحميل السلة"
          actionLabel="إعادة المحاولة"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  if (lines.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="السلة" />
        <EmptyState
          icon="bag-outline"
          title="سلتك فارغة"
          description="اكتشف المنتجات وأضف ما يعجبك."
          actionLabel="تسوّق الآن"
          onAction={() => router.push('/(tabs)')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="السلة"
        subtitle={formatItemCount(lines.length)}
        action={
          <Pressable onPress={confirmClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="إفراغ السلة">
            <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
          </Pressable>
        }
      />

      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        renderItem={({ item }) => (
          <CartRow
            line={item}
            onQuantityChange={(quantity) => updateQuantity.mutate({ itemId: item.id, quantity })}
            onRemove={() => removeItem.mutate(item.id)}
            onOpen={() => router.push({ pathname: '/product/[id]', params: { id: item.productId } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge * 2,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          blocked ? (
            <Card
              appearance="flat"
              padding="md"
              style={{ backgroundColor: theme.colors.warningSoft, marginBottom: theme.spacing.md, gap: theme.spacing.xs }}
            >
              {cart?.issues.map((issue) => (
                <Text key={issue} variant="caption" color={theme.colors.warning}>
                  • {issue}
                </Text>
              ))}
            </Card>
          ) : null
        }
      />

      <View
        style={[
          styles.summary,
          theme.shadows.lg,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
            gap: theme.spacing.md,
          },
        ]}
      >
        <View style={[styles.row, styles.spread]}>
          <Text variant="callout" muted>
            المجموع
          </Text>
          <Price value={cart?.subtotal ?? 0} variant="priceLarge" color={theme.colors.primary} />
        </View>

        <Badge label="الدفع بالبطاقة مسبقاً · لا يوجد دفع عند الاستلام" tone="primary" icon="lock-closed-outline" />

        <Button
          label={blocked ? 'راجع التنبيهات أعلاه' : 'إتمام الشراء'}
          icon="card-outline"
          size="lg"
          fullWidth
          disabled={blocked}
          onPress={() => router.push('/checkout')}
        />
      </View>
    </Screen>
  );
}

function CartRow({
  line,
  onQuantityChange,
  onRemove,
  onOpen,
}: {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();

  if (!line.product) {
    return (
      <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.sm }}>
        <Text variant="bodyStrong" color={theme.colors.danger}>
          منتج لم يعد متوفراً
        </Text>
        <Button label="حذف من السلة" variant="outline" size="sm" onPress={onRemove} />
      </Card>
    );
  }

  const { product } = line;

  return (
    <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.md }}>
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <Pressable onPress={onOpen} accessibilityRole="button">
          <ProductImage uri={product.primaryImage} radius={theme.radius.md} style={{ width: 84 }} />
        </Pressable>

        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Pressable onPress={onOpen} accessibilityRole="button">
            <Text variant="callout" numberOfLines={2}>
              {product.title}
            </Text>
          </Pressable>

          <Price value={line.unitPrice} compareAt={product.compareAtPrice} variant="bodyStrong" />

          {!line.available && <Badge label="نفد المخزون" tone="danger" icon="alert-circle-outline" />}
        </View>

        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="حذف المنتج">
          <Ionicons name="close" size={20} color={theme.colors.textSubtle} />
        </Pressable>
      </View>

      <Divider />

      <View style={[styles.row, styles.spread]}>
        <QuantityStepper
          value={line.quantity}
          onChange={onQuantityChange}
          min={line.minOrderQuantity}
          size="sm"
          editable={false}
        />
        <Price value={line.lineTotal} variant="price" />
      </View>
    </Card>
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
  summary: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
