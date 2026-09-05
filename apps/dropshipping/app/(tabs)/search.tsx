import {
  ApiRequestError,
  Chip,
  ChipRow,
  EmptyState,
  ProductCard,
  ProductCardSkeleton,
  Screen,
  SearchBar,
  Text,
  formatItemCount,
  useApi,
  useCartMutations,
  useProducts,
  useTheme,
  type ProductSummary,
} from '@ecommerce/shared-ui';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  countActiveFilters,
  DEFAULT_FILTERS,
  FilterSheet,
  type CatalogFilters,
} from '../../components/FilterSheet';

const COLUMNS = 2;

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isSignedIn } = useApi();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useProducts({
    q: search || undefined,
    supplier: filters.supplier,
    subcategory: filters.subcategory,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
  });

  const { addItem } = useCartMutations();

  const cardWidth = useMemo(
    () => (width - theme.spacing.lg * 2 - theme.spacing.md * (COLUMNS - 1)) / COLUMNS,
    [width, theme.spacing],
  );

  const activeFilters = countActiveFilters(filters);

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
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث عن منتج…"
          onFilterPress={() => setFiltersOpen(true)}
          filterActive={activeFilters > 0}
          autoFocus={false}
        />
      </View>

      {activeFilters > 0 && (
        <View style={{ paddingBottom: theme.spacing.md }}>
          <ChipRow>
            {filters.subcategory && (
              <Chip
                label={filters.subcategory}
                selected
                icon="pricetag-outline"
                onRemove={() => setFilters((current) => ({ ...current, subcategory: undefined }))}
              />
            )}
            {filters.supplier && (
              <Chip
                label={filters.supplier}
                selected
                icon="business-outline"
                onRemove={() => setFilters((current) => ({ ...current, supplier: undefined }))}
              />
            )}
            {(filters.minPrice !== undefined || filters.maxPrice !== undefined) && (
              <Chip
                label={`${filters.minPrice ?? 0} — ${filters.maxPrice ?? '∞'} د.م.`}
                selected
                icon="cash-outline"
                onRemove={() =>
                  setFilters((current) => ({ ...current, minPrice: undefined, maxPrice: undefined }))
                }
              />
            )}
            {filters.sort !== 'newest' && (
              <Chip
                label="ترتيب مخصص"
                selected
                icon="swap-vertical-outline"
                onRemove={() => setFilters((current) => ({ ...current, sort: 'newest' }))}
              />
            )}
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
        keyboardDismissMode="on-drag"
        onEndReached={query.loadMore}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          query.isSuccess && query.total > 0 ? (
            <Text variant="caption" muted style={{ paddingBottom: theme.spacing.md }}>
              {formatItemCount(query.total)}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={[styles.skeletonRow, { gap: theme.spacing.md }]}>
              {Array.from({ length: COLUMNS }).map((_, index) => (
                <ProductCardSkeleton key={index} width={cardWidth} />
              ))}
            </View>
          ) : query.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              tone="error"
              title="تعذر تحميل النتائج"
              description={
                query.error instanceof ApiRequestError ? query.error.message : 'حدث خطأ غير متوقع.'
              }
              actionLabel="إعادة المحاولة"
              onAction={() => void query.refetch()}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title={search ? 'لا توجد نتائج' : 'ابحث عمّا تريد'}
              description={
                search
                  ? 'جرّب كلمات أخرى أو عدّل الفلاتر.'
                  : 'اكتب اسم المنتج أو وصفه في الحقل أعلاه.'
              }
              {...(search || activeFilters > 0
                ? {
                    actionLabel: 'مسح البحث',
                    onAction: () => {
                      setSearch('');
                      setFilters(DEFAULT_FILTERS);
                    },
                  }
                : {})}
            />
          )
        }
      />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        search={search || undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row',
  },
});
