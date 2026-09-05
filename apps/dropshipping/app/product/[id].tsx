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
  formatMAD,
  useApi,
  useCartMutations,
  useProduct,
  useTheme,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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

  useEffect(() => {
    if (product) setQuantity(Math.max(1, product.minOrderQuantity));
  }, [product]);

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="المنتج" onBack={() => router.back()} />
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
          <Skeleton width="100%" height={width * 0.85} radius={theme.radius.lg} />
          <Skeleton width="75%" height={22} />
          <Skeleton width="40%" height={28} />
          <Skeleton width="100%" height={100} radius={theme.radius.md} />
        </View>
      </Screen>
    );
  }

  if (isError || !product) {
    return (
      <Screen>
        <ScreenHeader title="المنتج" onBack={() => router.back()} />
        <EmptyState
          icon="alert-circle-outline"
          tone="error"
          title="تعذر تحميل المنتج"
          description={
            error instanceof ApiRequestError && error.status === 404
              ? 'هذا المنتج لم يعد متوفراً.'
              : 'حدث خطأ أثناء الاتصال بالخادم.'
          }
          actionLabel="إعادة المحاولة"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  const images = product.images.length > 0 ? product.images : [null];
  const lineTotal = Math.round(product.price * quantity * 100) / 100;

  const addToCart = (thenCheckout: boolean) => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    addItem.mutate(
      { productId: product.id, quantity },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (thenCheckout) {
            router.push('/checkout');
            return;
          }
          setAdded(true);
          setTimeout(() => setAdded(false), 2200);
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={product.subcategory ?? 'المنتج'} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => `${uri ?? 'placeholder'}-${index}`}
            onMomentumScrollEnd={(event) =>
              setGalleryIndex(Math.round(event.nativeEvent.contentOffset.x / width))
            }
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
          <View style={{ gap: theme.spacing.sm }}>
            <View style={[styles.badgeRow, { gap: theme.spacing.sm }]}>
              {product.discountPercent !== null && product.discountPercent > 0 && (
                <Badge label={`خصم ${product.discountPercent}%`} tone="danger" icon="flame-outline" />
              )}
              {!product.inStock && <Badge label="نفد المخزون" tone="neutral" icon="close-circle-outline" />}
              {product.shippingDays !== null && (
                <Badge label={`التوصيل خلال ${product.shippingDays} أيام`} tone="accent" icon="time-outline" />
              )}
            </View>

            <Text variant="h1">{product.title}</Text>

            <Price
              value={product.price}
              compareAt={product.compareAtPrice}
              variant="priceLarge"
              color={theme.colors.primary}
            />

            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <Text variant="caption" color={theme.colors.success}>
                توفّر {formatMAD(product.compareAtPrice - product.price)} على هذا المنتج
              </Text>
            )}
          </View>

          {(product.colors.length > 0 || product.sizes.length > 0) && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">الخيارات</Text>
              {product.colors.length > 0 && <SpecRow label="الألوان" value={product.colors.join('، ')} />}
              {product.sizes.length > 0 && <SpecRow label="المقاسات" value={product.sizes.join('، ')} />}
            </View>
          )}

          {product.description.length > 0 && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">الوصف</Text>
              <Text variant="body" color={theme.colors.textMuted}>
                {product.description}
              </Text>
            </View>
          )}

          {(product.specs.length > 0 || product.weightGrams !== null || product.sku) && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="h3">تفاصيل المنتج</Text>
              <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.sm }}>
                {product.sku && <SpecRow label="المرجع" value={product.sku} />}
                {product.weightGrams !== null && (
                  <SpecRow label="الوزن" value={`${product.weightGrams} غرام`} />
                )}
                {product.specs.map((spec) => (
                  <SpecRow key={spec.key} label={spec.label} value={spec.value} />
                ))}
              </Card>
            </View>
          )}

          <Card appearance="flat" padding="md" style={{ backgroundColor: theme.colors.surfaceAlt, gap: theme.spacing.sm }}>
            <View style={[styles.row, { gap: theme.spacing.sm }]}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.colors.success} />
              <Text variant="caption" style={{ flex: 1 }}>
                الدفع مسبق بالبطاقة البنكية عبر صفحة آمنة — لا يوجد دفع عند الاستلام.
              </Text>
            </View>
            <Divider />
            <View style={[styles.row, { gap: theme.spacing.sm }]}>
              <Ionicons name="cube-outline" size={16} color={theme.colors.textMuted} />
              <Text variant="caption" muted style={{ flex: 1 }}>
                تتبّع طلبك من التطبيق في كل مرحلة حتى التسليم.
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      <View
        style={[
          styles.actionBar,
          theme.shadows.lg,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.lg + insets.bottom,
            gap: theme.spacing.md,
          },
        ]}
      >
        <View style={[styles.row, styles.spread, { gap: theme.spacing.md }]}>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            min={Math.max(1, product.minOrderQuantity)}
            size="sm"
          />
          <Price value={lineTotal} variant="price" color={theme.colors.primary} />
        </View>

        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <Button
            label={added ? 'أُضيف' : 'أضف إلى السلة'}
            icon={added ? 'checkmark' : 'bag-add-outline'}
            variant="secondary"
            size="lg"
            disabled={!product.inStock}
            loading={addItem.isPending}
            onPress={() => addToCart(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="اشترِ الآن"
            icon="flash-outline"
            size="lg"
            disabled={!product.inStock}
            onPress={() => addToCart(true)}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Screen>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.spread, { gap: theme.spacing.lg, paddingVertical: 2 }]}>
      <Text variant="caption" muted>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spread: {
    justifyContent: 'space-between',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
