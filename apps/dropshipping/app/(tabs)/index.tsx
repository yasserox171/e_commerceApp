import {
  ApiRequestError,
  Badge,
  Chip,
  ChipRow,
  EmptyState,
  ProductCard,
  ProductCardSkeleton,
  Screen,
  Text,
  useApi,
  useCartMutations,
  useFacets,
  useProducts,
  useTheme,
  type ProductSummary,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { APP } from '../../config';

const COLUMNS = 2;

/**
 * The storefront.
 *
 * A category chip row sits above an infinite two-column grid — the 2026 default
 * for a mobile catalogue: browsing stays one thumb away, and adding to the cart
 * never leaves the list.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isSignedIn, user } = useApi();

  const [category, setCategory] = useState<string | undefined>(undefined);
  const facets = useFacets();
  const query = useProducts(category ? { subcategory: category } : {});
  const { addItem } = useCartMutations();

  const cardWidth = useMemo(
    () => (width - theme.spacing.lg * 2 - theme.spacing.md * (COLUMNS - 1)) / COLUMNS,
    [width, theme.spacing],
  );

  const openProduct = (product: ProductSummary) =>
    router.push({ pathname: '/product/[id]', params: { id: product.id } });

  const quickAdd = (product: ProductSummary) => {
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    addItem.mutate(
      { productId: product.id, quantity: Math.max(1, product.minOrderQuantity) },
      { onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
    );
  };

  return (
    <Screen>
      <View
        style={[
          styles.header,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.md },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted>
            {isSignedIn && user?.fullName ? `مرحباً ${user.fullName.split(' ')[0]}` : 'مرحباً بك في'}
          </Text>
          <Text variant="h1">{APP.name}</Text>
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/search')}
          accessibilityRole="button"
          accessibilityLabel="بحث"
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      {(facets.data?.subcategories.length ?? 0) > 0 && (
        <View style={{ paddingBottom: theme.spacing.md }}>
          <ChipRow>
            <Chip label="الكل" selected={category === undefined} onPress={() => setCategory(undefined)} />
            {facets.data?.subcategories.map((entry) => (
              <Chip
                key={entry.value}
                label={entry.value}
                count={entry.count}
                selected={category === entry.value}
                onPress={() => setCategory(entry.value)}
              />
            ))}
          </ChipRow>
        </View>
      )}

      <FlatList
        data={query.items}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            width={cardWidth}
            onPress={openProduct}
            onQuickAdd={quickAdd}
            quickAddIcon="bag-add-outline"
          />
        )}
        columnWrapperStyle={{ gap: theme.spacing.md }}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={query.loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingBottom: theme.spacing.md, gap: theme.spacing.sm }}>
            <Badge label="الدفع بالبطاقة فقط · بدون دفع عند الاستلام" tone="primary" icon="card-outline" />
            <Text variant="caption" muted>
              {APP.tagline}
            </Text>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonGrid cardWidth={cardWidth} />
          ) : query.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              tone="error"
              title="تعذر تحميل المنتجات"
              description={
                query.error instanceof ApiRequestError
                  ? query.error.message
                  : 'حدث خطأ غير متوقع أثناء الاتصال بالخادم.'
              }
              actionLabel="إعادة المحاولة"
              onAction={() => void query.refetch()}
            />
          ) : (
            <EmptyState
              icon="bag-outline"
              title="لا توجد منتجات"
              description={
                category
                  ? 'لا توجد منتجات في هذه الفئة حالياً.'
                  : 'لم تتم إضافة أي منتجات بعد. عد لاحقاً.'
              }
              {...(category ? { actionLabel: 'عرض كل الفئات', onAction: () => setCategory(undefined) } : {})}
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={{ paddingTop: theme.spacing.xl }}>
              <SkeletonGrid cardWidth={cardWidth} rows={1} />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function SkeletonGrid({ cardWidth, rows = 3 }: { cardWidth: number; rows?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xl }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <View key={rowIndex} style={[styles.skeletonRow, { gap: theme.spacing.md }]}>
          {Array.from({ length: COLUMNS }).map((__, columnIndex) => (
            <ProductCardSkeleton key={columnIndex} width={cardWidth} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
});
