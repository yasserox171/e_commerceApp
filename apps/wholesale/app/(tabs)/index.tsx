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
  useProducts,
  useTheme,
  type ProductSummary,
} from '@ecommerce/shared-ui';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { APP } from '../../config';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  FilterSheet,
  type CatalogFilters,
} from '../../components/FilterSheet';

const COLUMNS = 2;

export default function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

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

  // Two columns with a gutter on each side and one between them.
  const cardWidth = useMemo(
    () => (width - theme.spacing.lg * 2 - theme.spacing.md * (COLUMNS - 1)) / COLUMNS,
    [width, theme.spacing],
  );

  const activeFilters = countActiveFilters(filters);

  const openProduct = (product: ProductSummary) => {
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  };

  const clearFilter = (key: keyof CatalogFilters) => {
    setFilters((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text variant="display">{APP.name}</Text>
        <Text variant="caption" muted>
          {APP.tagline}
        </Text>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث بالاسم أو الوصف…"
          onFilterPress={() => setFiltersOpen(true)}
          filterActive={activeFilters > 0}
        />
      </View>

      {activeFilters > 0 && (
        <View style={{ paddingBottom: theme.spacing.md }}>
          <ChipRow>
            {filters.supplier && (
              <Chip label={filters.supplier} selected icon="business-outline" onRemove={() => clearFilter('supplier')} />
            )}
            {filters.subcategory && (
              <Chip label={filters.subcategory} selected icon="pricetag-outline" onRemove={() => clearFilter('subcategory')} />
            )}
            {(filters.minPrice !== undefined || filters.maxPrice !== undefined) && (
              <Chip
                label={`${filters.minPrice ?? 0} — ${filters.maxPrice ?? '∞'} د.م.`}
                selected
                icon="cash-outline"
                onRemove={() => setFilters((current) => ({ ...current, minPrice: undefined, maxPrice: undefined }))}
              />
            )}
            {filters.sort !== 'newest' && (
              <Chip label="ترتيب مخصص" selected icon="swap-vertical-outline" onRemove={() => setFilters((c) => ({ ...c, sort: 'newest' }))} />
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
            onQuickAdd={openProduct}
            quickAddIcon="calculator-outline"
            showWholesaleMeta
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
          query.isSuccess && query.total > 0 ? (
            <Text variant="caption" muted style={{ paddingBottom: theme.spacing.md }}>
              {formatItemCount(query.total)}
            </Text>
          ) : null
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
              icon="search-outline"
              title="لا توجد نتائج"
              description={
                search || activeFilters > 0
                  ? 'جرّب كلمات بحث أخرى أو امسح الفلاتر.'
                  : 'لم تتم إضافة أي منتجات جملة بعد.'
              }
              {...(search || activeFilters > 0
                ? {
                    actionLabel: 'مسح البحث والفلاتر',
                    onAction: () => {
                      setSearch('');
                      setFilters(DEFAULT_FILTERS);
                    },
                  }
                : {})}
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

function SkeletonGrid({ cardWidth, rows = 3 }: { cardWidth: number; rows?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.skeletonGrid, { gap: theme.spacing.xl }]}>
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
  skeletonGrid: {
    flexDirection: 'column',
  },
  skeletonRow: {
    flexDirection: 'row',
  },
});
