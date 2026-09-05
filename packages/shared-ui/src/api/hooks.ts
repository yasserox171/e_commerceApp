import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import type {
  CartView,
  CheckoutSession,
  OrderDetail,
  OrderSummary,
  Paginated,
  ProductDetail,
  ProductFacets,
  ProductQueryParams,
  ProductSummary,
  ShippingAddress,
} from '../types.js';
import { useApi, useApiClient } from './ApiProvider.js';

/**
 * Query keys are hierarchical so an invalidation can target one product or the
 * whole catalogue: `['products']` clears every list, `['products', 'detail', id]`
 * clears one.
 */
export const queryKeys = {
  products: (params: Omit<ProductQueryParams, 'channel'>) => ['products', 'list', params] as const,
  product: (id: string, quantity?: number) => ['products', 'detail', id, quantity ?? null] as const,
  facets: (search?: string) => ['products', 'facets', search ?? null] as const,
  cart: () => ['cart'] as const,
  orders: () => ['orders', 'list'] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
  paymentMethods: () => ['payments', 'methods'] as const,
};

const PAGE_SIZE = 20;

/** Infinite catalogue list — one page per scroll to the bottom. */
export function useProducts(params: Omit<ProductQueryParams, 'channel' | 'page'> = {}) {
  const client = useApiClient();
  const pageSize = params.pageSize ?? PAGE_SIZE;

  const query = useInfiniteQuery({
    queryKey: queryKeys.products({ ...params, pageSize }),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      client.listProducts({ ...params, pageSize, page: pageParam }, signal),
    getNextPageParam: (lastPage: Paginated<ProductSummary>) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
    total: query.data?.pages[0]?.total ?? 0,
    /** Safe to call on every `onEndReached` — it no-ops while a page is in flight. */
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

export function useProduct(id: string | undefined, quantity?: number) {
  const client = useApiClient();

  return useQuery<ProductDetail>({
    queryKey: queryKeys.product(id ?? '', quantity),
    queryFn: ({ signal }) => client.getProduct(id!, quantity, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useFacets(search?: string) {
  const client = useApiClient();

  return useQuery<ProductFacets>({
    queryKey: queryKeys.facets(search),
    queryFn: ({ signal }) => client.getFacets(search, signal),
    staleTime: 5 * 60_000,
  });
}

export function useCart() {
  const client = useApiClient();
  const { isSignedIn } = useApi();

  return useQuery<CartView>({
    queryKey: queryKeys.cart(),
    queryFn: () => client.getCart(),
    enabled: isSignedIn,
    staleTime: 0,
  });
}

/**
 * All cart writes return the whole recomputed cart, so each mutation seeds the
 * cache with the response instead of triggering a refetch round trip.
 */
export function useCartMutations() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const seed = (cart: CartView) => queryClient.setQueryData(queryKeys.cart(), cart);

  const addItem = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      client.addToCart(productId, quantity),
    onSuccess: seed,
  });

  const updateQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      client.updateCartItem(itemId, quantity),
    onSuccess: seed,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => client.removeCartItem(itemId),
    onSuccess: seed,
  });

  const clear = useMutation({
    mutationFn: () => client.clearCart(),
    onSuccess: seed,
  });

  return { addItem, updateQuantity, removeItem, clear };
}

export function useOrders() {
  const client = useApiClient();
  const { isSignedIn } = useApi();

  const query = useInfiniteQuery({
    queryKey: queryKeys.orders(),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => client.listOrders(pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage: Paginated<OrderSummary>) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: isSignedIn,
    staleTime: 30_000,
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    ...query,
    items,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

export function useOrder(id: string | undefined) {
  const client = useApiClient();

  return useQuery<OrderDetail>({
    queryKey: queryKeys.order(id ?? ''),
    queryFn: () => client.getOrder(id!),
    enabled: Boolean(id),
    // While the gateway callback is still landing, poll so the tracking screen
    // flips from "awaiting payment" to "processing" without a manual pull.
    refetchInterval: (query) =>
      query.state.data?.status === 'pending_payment' ? 5_000 : false,
  });
}

export function useCreateOrder(): UseMutationResult<
  OrderDetail,
  Error,
  { shippingAddress: ShippingAddress; customerNote?: string; paymentMethod?: 'card' | 'bank_transfer' }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) => client.createOrder(input),
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart() });
    },
  });
}

export function useCancelOrder() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => client.cancelOrder(orderId),
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}

export function useStartCheckout(): UseMutationResult<CheckoutSession, Error, string> {
  const client = useApiClient();
  return useMutation({ mutationFn: (orderId: string) => client.startCheckout(orderId) });
}

export function usePaymentMethods() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.paymentMethods(),
    queryFn: () => client.getPaymentMethods(),
    staleTime: 30 * 60_000,
  });
}
