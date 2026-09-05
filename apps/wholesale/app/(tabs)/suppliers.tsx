import {
  Card,
  EmptyState,
  ListRowSkeleton,
  ProductCard,
  Screen,
  ScreenHeader,
  Text,
  formatItemCount,
  rtl,
  useFacets,
  useProducts,
  useTheme,
  type ProductSummary,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

const COLUMNS = 2;

type Selection = { kind: 'supplier' | 'subcategory'; value: string } | null;

/**
 * Browse by supplier or category.
 *
 * Selecting a facet swaps this screen into a filtered grid rather than pushing
 * a new route — one tap in, one tap back, and the facet list keeps its scroll
 * position underneath.
 */
export default function SuppliersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selection, setSelection] = useState<Selection>(null);

  const facets = useFacets();

  const products = useProducts(
    selection?.kind === 'supplier'
      ? { supplier: selection.value }
      : selection?.kind === 'subcategory'
        ? { subcategory: selection.value }
        : { pageSize: 1 },
  );

  const cardWidth = useMemo(
    () => (width - theme.spacing.lg * 2 - theme.spacing.md * (COLUMNS - 1)) / COLUMNS,
    [width, theme.spacing],
  );

  const openProduct = (product: ProductSummary) =>
    router.push({ pathname: '/product/[id]', params: { id: product.id } });

  if (selection) {
    return (
      <Screen>
        <ScreenHeader
          title={selection.value}
          subtitle={products.isSuccess ? formatItemCount(products.total) : undefined}
          onBack={() => setSelection(null)}
        />
        <FlatList
          data={products.items}
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
          onEndReached={products.loadMore}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={
            products.isLoading ? (
              <View style={{ gap: theme.spacing.md }}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <ListRowSkeleton key={index} />
                ))}
              </View>
            ) : (
              <EmptyState icon="cube-outline" title="لا توجد منتجات هنا حالياً" />
            )
          }
        />
      </Screen>
    );
  }

  const hasFacets =
    (facets.data?.suppliers.length ?? 0) > 0 || (facets.data?.subcategories.length ?? 0) > 0;

  return (
    <Screen>
      <ScreenHeader title="الموردون والفئات" subtitle="تصفح المنتجات حسب المصدر" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={facets.isRefetching}
            onRefresh={() => void facets.refetch()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {facets.isLoading ? (
          <View style={{ gap: theme.spacing.md }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <ListRowSkeleton key={index} />
            ))}
          </View>
        ) : !hasFacets ? (
          <EmptyState
            icon="business-outline"
            title="لا توجد بيانات موردين"
            description="حقل extra_info في قاعدة البيانات لا يحتوي على مورّد أو فئة لهذه المنتجات."
          />
        ) : (
          <View style={{ gap: theme.spacing.xxl }}>
            <FacetGroup
              title="الموردون"
              icon="business-outline"
              entries={facets.data?.suppliers ?? []}
              onSelect={(value) => setSelection({ kind: 'supplier', value })}
            />
            <FacetGroup
              title="الفئات"
              icon="pricetag-outline"
              entries={facets.data?.subcategories ?? []}
              onSelect={(value) => setSelection({ kind: 'subcategory', value })}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function FacetGroup({
  title,
  icon,
  entries,
  onSelect,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  entries: Array<{ value: string; count: number }>;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  if (entries.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="h3">{title}</Text>

      <View style={{ gap: theme.spacing.sm }}>
        {entries.map((entry) => (
          <Pressable
            key={entry.value}
            onPress={() => onSelect(entry.value)}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card appearance="outlined" padding="md">
              <View style={[styles.row, { gap: theme.spacing.md }]}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.md },
                  ]}
                >
                  <Ionicons name={icon} size={20} color={theme.colors.primary} />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {entry.value}
                  </Text>
                  <Text variant="micro" muted>
                    {formatItemCount(entry.count)}
                  </Text>
                </View>

                <Ionicons name={rtl.forwardChevron()} size={18} color={theme.colors.textSubtle} />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
