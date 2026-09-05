import {
  Badge,
  Card,
  EmptyState,
  ListRowSkeleton,
  Price,
  ProductImage,
  Screen,
  ScreenHeader,
  Text,
  formatItemCount,
  formatRelative,
  orderStatusLabel,
  orderStatusTone,
  rtl,
  useOrders,
  useTheme,
  type OrderSummary,
} from '@ecommerce/shared-ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AuthGate } from '../../components/AuthGate';

export default function OrdersScreen() {
  return (
    <AuthGate title="طلباتي" reason="سجّل الدخول لعرض طلباتك وتتبّع الشحنات.">
      <OrdersContent />
    </AuthGate>
  );
}

function OrdersContent() {
  const theme = useTheme();
  const router = useRouter();
  const query = useOrders();

  return (
    <Screen>
      <ScreenHeader title="طلباتي" subtitle="تتبّع شحناتك" />

      <FlatList
        data={query.items}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.huge,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={query.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={{ gap: theme.spacing.md }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <ListRowSkeleton key={index} />
              ))}
            </View>
          ) : query.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              tone="error"
              title="تعذر تحميل الطلبات"
              actionLabel="إعادة المحاولة"
              onAction={() => void query.refetch()}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="لا توجد طلبات بعد"
              description="ستظهر هنا كل طلباتك مع حالة الشحن."
              actionLabel="تسوّق الآن"
              onAction={() => router.push('/(tabs)')}
            />
          )
        }
      />
    </Screen>
  );
}

function OrderRow({ order, onPress }: { order: OrderSummary; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card appearance="outlined" padding="md" style={{ gap: theme.spacing.md }}>
        <View style={[styles.row, styles.spread]}>
          <View style={{ gap: 2 }}>
            <Text variant="bodyStrong" style={styles.ltr}>
              {order.reference}
            </Text>
            <Text variant="micro" muted>
              {formatRelative(order.createdAt)} · {formatItemCount(order.itemCount)}
            </Text>
          </View>
          <Badge label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
        </View>

        {order.thumbnails.length > 0 && (
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            {order.thumbnails.map((uri) => (
              <ProductImage key={uri} uri={uri} radius={theme.radius.sm} style={{ width: 48 }} />
            ))}
          </View>
        )}

        <View style={[styles.row, styles.spread]}>
          <Price value={order.total} variant="price" color={theme.colors.primary} />
          <Ionicons name={rtl.forwardChevron()} size={18} color={theme.colors.textSubtle} />
        </View>
      </Card>
    </Pressable>
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
