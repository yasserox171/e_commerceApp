import {
  ApiRequestError,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Price,
  ProductImage,
  QuantityStepper,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  TierTable,
  formatMAD,
  useApi,
  useCartMutations,
  useProduct,
  useTheme,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProductDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn } = useApi();

  const { data: product, isLoading, isError, error, refetch } = useProduct(id);
  const { addItem } = useCartMutations();

  const [quantity, setQuantity] = useState(1);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [added, setAdded] = useState(false);

  // Wholesale minimums vary per product, so the stepper starts at whatever this
  // one actually requires rather than at 1.
  useEffect(() => {
    if (product) setQuantity(product.minOrderQuantity);
  }, [product]);

  // Mirrors the server's tier resolution so the total updates instantly while
  // the buyer drags the stepper, with no round trip.
  const quote = useMemo(() => {
    if (!product) return null;
    let matched = product.tiers[0]!;
    let matchedIndex = 0;
    for (let index = 0; index < product.tiers.length; index += 1) {
      const tier = product.tiers[index]!;
      if (quantity >= tier.minQuantity) {
        matched = tier;
        matchedIndex = index;
      } else break;
    }
    return {
      unitPrice: matched.unitPrice,
      lineTotal: Math.round(matched.unitPrice * quantity * 100) / 100,
      nextTier: product.tiers[matchedIndex + 1] ?? null,
    };
  }, [product, quantity]);

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل المنتج" onBack={() => router.back()} />
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
          <Skeleton width="100%" height={width * 0.8} radius={theme.radius.lg} />
          <Skeleton width="70%" height={22} />
          <Skeleton width="40%" height={26} />
          <Skeleton width="100%" height={120} radius={theme.radius.md} />
        </View>
      </Screen>
    );
  }

  if (isError || !product) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل المنتج" onBack={() => router.back()} />
        <EmptyState
          icon="alert-circle-outline"
          tone="error"
          title="تعذر تحميل المنتج"
          description={
            error instanceof ApiRequestError && error.status === 404
              ? 'هذا المنتج لم يعد متوفراً في كتالوج الجملة.'
              : 'حدث خطأ أثناء الاتصال بالخادم.'
          }
          actionLabel="إعادة المحاولة"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  const images = product.images.length > 0 ? product.images : [null];

  const handleAdd = () => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    addItem.mutate(
      { productId: product.id, quantity },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setAdded(true);
          setTimeout(() => setAdded(false), 2200);
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={product.supplier ?? 'تفاصيل المنتج'} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gallery */}
        <View>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => `${uri ?? 'placeholder'}-${index}`}
            onMomentumScrollEnd={(event) => {
              setGalleryIndex(Math.round(event.nativeEvent.contentOffset.x / width));
            }}
            renderItem={({ item }) => (
              <View style={{ width, paddingHorizontal: theme.spacing.lg }}>
                <ProductImage uri={item} aspectRatio={1} radius={theme.radius.xl} priority="high" />
              </View>
            )}
          />

          {images.length > 1 && (
            <View style={[styles.dots, { gap: theme.spacing.xs, marginTop: theme.spacing.md }]}>
              {images.map((uri, index) => (
                <View
                  key={`${uri ?? 'dot'}-${index}`}
                  style={{
                    width: index === galleryIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: index === galleryIndex ? theme.colors.primary : theme.colors.border,
                  }}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
          {/* Identity */}
          <View style={{ gap: theme.spacing.sm }}>
            <View style={[styles.badgeRow, { gap: theme.spacing.sm }]}>
              {!product.inStock && <Badge label="نفد المخزون" tone="danger" icon="close-circle-outline" />}
              {product.stock !== null && product.stock > 0 && (
                <Badge label={`متوفر: ${product.stock}`} tone="success" icon="checkmark-circle-outline" />
              )}
              {product.subcategory && <Badge label={product.subcategory} tone="neutral" />}
              {product.sku && <Badge label={`SKU ${product.sku}`} tone="neutral" />}
            </View>

            <Text variant="h1">{product.title}</Text>

            <Price
              value={quote?.unitPrice ?? product.price}
              compareAt={product.compareAtPrice}
              unit={product.unit ?? 'الوحدة'}
              variant="priceLarge"
              color={theme.colors.primary}
            />
          </View>

          {/* Quantity + live total */}
          <Card appearance="outlined" style={{ gap: theme.spacing.md }}>
            <View style={[styles.spread, { gap: theme.spacing.md }]}>
              <View style={{ gap: 2 }}>
                <Text variant="bodyStrong">الكمية</Text>
                <Text variant="micro" muted>
                  الحد الأدنى {product.minOrderQuantity} {product.unit ?? 'قطعة'}
                </Text>
              </View>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                min={product.minOrderQuantity}
                step={product.minOrderQuantity > 1 ? product.minOrderQuantity : 1}
              />
            </View>

            <Divider />

            <View style={styles.spread}>
              <Text variant="callout" muted>
                إجمالي السطر
              </Text>
              <Price value={quote?.lineTotal ?? 0} variant="price" />
            </View>

            {quote?.nextTier && (
              <View style={[styles.hint, { gap: theme.spacing.sm, backgroundColor: theme.colors.accentSoft, padding: theme.spacing.md, borderRadius: theme.radius.md }]}>
                <Ionicons name="trending-down-outline" size={16} color={theme.colors.accent} />
                <Text variant="micro" color={theme.colors.accent} style={{ flex: 1 }}>
                  اطلب {quote.nextTier.minQuantity} وحدة أو أكثر واحصل على{' '}
                  {formatMAD(quote.nextTier.unitPrice)} للوحدة
                </Text>
              </View>
            )}
          </Card>

          {/* Price ladder */}
          {product.tiers.length > 1 && (
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="h3">سلّم الأسعار</Text>
              <TierTable tiers={product.tiers} activeQuantity={quantity} unit={product.unit} />
            </View>
          )}

          {/* Description */}
          {product.description.length > 0 && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">الوصف</Text>
              <Text variant="body" color={theme.colors.textMuted}>
                {product.description}
              </Text>
            </View>
          )}

          {/* Variants surfaced from extra_info */}
          {(product.colors.length > 0 || product.sizes.length > 0) && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">الخيارات المتاحة</Text>
              {product.colors.length > 0 && (
                <SpecRow label="الألوان" value={product.colors.join('، ')} />
              )}
              {product.sizes.length > 0 && <SpecRow label="المقاسات" value={product.sizes.join('، ')} />}
            </View>
          )}

          {/* Everything else the pipeline put in extra_info */}
          {(product.specs.length > 0 || product.shippingDays !== null || product.weightGrams !== null) && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">معلومات إضافية</Text>
              <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.sm }}>
                {product.shippingDays !== null && (
                  <SpecRow label="مدة التحضير" value={`${product.shippingDays} أيام`} />
                )}
                {product.weightGrams !== null && (
                  <SpecRow label="الوزن" value={`${product.weightGrams} غرام`} />
                )}
                {product.specs.map((spec) => (
                  <SpecRow key={spec.key} label={spec.label} value={spec.value} />
                ))}
              </Card>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky add bar — the primary action never scrolls out of the thumb zone. */}
      <View
        style={[
          styles.actionBar,
          theme.shadows.lg,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            padding: theme.spacing.lg,
            // This screen is pushed over the tab bar, so it owns the bottom
            // inset itself — without this the button sits under the home bar.
            paddingBottom: theme.spacing.lg + insets.bottom,
            gap: theme.spacing.md,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="micro" muted>
            {quantity} × {formatMAD(quote?.unitPrice ?? product.price)}
          </Text>
          <Price value={quote?.lineTotal ?? 0} variant="price" color={theme.colors.primary} />
        </View>

        <Button
          label={added ? 'أُضيف إلى الطلبية' : isSignedIn ? 'أضف إلى الطلبية' : 'سجّل الدخول للطلب'}
          icon={added ? 'checkmark' : 'add'}
          size="lg"
          loading={addItem.isPending}
          disabled={!product.inStock}
          onPress={handleAdd}
          style={{ flex: 1.4 }}
        />
      </View>
    </Screen>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.spread, { gap: theme.spacing.lg, paddingVertical: 2 }]}>
      <Text variant="caption" muted style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text variant="caption" align="left" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
