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
  formatMAD,
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

export default function QuoteScreen() {
  return (
    <AuthGate title="الطلبية" reason="سجّل الدخول بحساب الجملة لعرض طلبيتك ومتابعة الطلبات.">
      <QuoteContent />
    </AuthGate>
  );
}

function QuoteContent() {
  const theme = useTheme();
  const router = useRouter();
  const { data: cart, isLoading, isError, refetch } = useCart();
  const { updateQuantity, removeItem, clear } = useCartMutations();

  const lines = cart?.lines ?? [];
  const blocked = (cart?.issues.length ?? 0) > 0;

  const confirmClear = () => {
    Alert.alert('إفراغ الطلبية', 'سيتم حذف كل المنتجات من الطلبية. هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إفراغ', style: 'destructive', onPress: () => clear.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="الطلبية" />
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
        <ScreenHeader title="الطلبية" />
        <EmptyState
          icon="cloud-offline-outline"
          tone="error"
          title="تعذر تحميل الطلبية"
          description="تحقق من اتصالك بالإنترنت ثم أعد المحاولة."
          actionLabel="إعادة المحاولة"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  if (lines.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="الطلبية" />
        <EmptyState
          icon="clipboard-outline"
          title="طلبيتك فارغة"
          description="أضف منتجات من الكتالوج لتبدأ طلبية جملة."
          actionLabel="تصفح الكتالوج"
          onAction={() => router.push('/(tabs)')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="الطلبية"
        subtitle={`${lines.length} سطر · ${cart?.unitCount ?? 0} وحدة`}
        action={
          <Pressable onPress={confirmClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="إفراغ الطلبية">
            <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
          </Pressable>
        }
      />

      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        renderItem={({ item }) => (
          <QuoteLine
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
              <View style={[styles.row, { gap: theme.spacing.sm }]}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.warning} />
                <Text variant="bodyStrong" color={theme.colors.warning}>
                  يلزم تعديل قبل الإرسال
                </Text>
              </View>
              {cart?.issues.map((issue) => (
                <Text key={issue} variant="caption" color={theme.colors.textMuted}>
                  • {issue}
                </Text>
              ))}
            </Card>
          ) : null
        }
      />

      {/* Summary bar pinned above the tab bar — the total stays visible while
          the buyer edits quantities further up the list. */}
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
            المجموع الفرعي
          </Text>
          <Price value={cart?.subtotal ?? 0} variant="priceLarge" color={theme.colors.primary} />
        </View>

        <Button
          label={blocked ? 'راجع التنبيهات أعلاه' : 'متابعة الطلب'}
          icon="arrow-back"
          iconTrailing
          size="lg"
          fullWidth
          disabled={blocked}
          onPress={() => router.push('/review-order')}
        />
      </View>
    </Screen>
  );
}

function QuoteLine({
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
        <Text variant="caption" muted>
          تمت إزالة هذا المنتج من الكتالوج.
        </Text>
        <Button label="حذف من الطلبية" variant="outline" size="sm" onPress={onRemove} />
      </Card>
    );
  }

  const { product } = line;
  const savingsVsFirstTier =
    line.tier && product.tiers[0] && product.tiers[0].unitPrice > line.unitPrice
      ? (product.tiers[0].unitPrice - line.unitPrice) * line.quantity
      : 0;

  return (
    <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.md }}>
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <Pressable onPress={onOpen} accessibilityRole="button">
          <ProductImage uri={product.primaryImage} radius={theme.radius.md} style={{ width: 76 }} />
        </Pressable>

        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Pressable onPress={onOpen} accessibilityRole="button">
            <Text variant="callout" numberOfLines={2}>
              {product.title}
            </Text>
          </Pressable>

          {product.supplier && (
            <Text variant="micro" muted>
              {product.supplier}
            </Text>
          )}

          <Price value={line.unitPrice} unit={product.unit ?? 'الوحدة'} variant="bodyStrong" />
        </View>

        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="حذف السطر">
          <Ionicons name="close" size={20} color={theme.colors.textSubtle} />
        </Pressable>
      </View>

      <Divider />

      <View style={[styles.row, styles.spread, { gap: theme.spacing.md }]}>
        <QuantityStepper
          value={line.quantity}
          onChange={onQuantityChange}
          min={line.minOrderQuantity}
          step={line.minOrderQuantity > 1 ? line.minOrderQuantity : 1}
        />
        <Price value={line.lineTotal} variant="price" color={theme.colors.text} />
      </View>

      {!line.meetsMinimum && (
        <Badge
          tone="warning"
          icon="alert-circle-outline"
          label={`الحد الأدنى ${line.minOrderQuantity} ${product.unit ?? 'قطعة'}`}
        />
      )}

      {line.nextTier && (
        <View style={[styles.row, { gap: theme.spacing.xs }]}>
          <Ionicons name="trending-down-outline" size={14} color={theme.colors.accent} />
          <Text variant="micro" color={theme.colors.accent}>
            أضف {line.nextTier.minQuantity - line.quantity} وحدة أخرى ليصبح السعر{' '}
            {formatMAD(line.nextTier.unitPrice)} للوحدة
          </Text>
        </View>
      )}

      {savingsVsFirstTier > 0 && (
        <Badge tone="success" icon="pricetag-outline" label={`وفّرت ${formatMAD(savingsVsFirstTier)}`} />
      )}
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
