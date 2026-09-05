/**
 * @ecommerce/shared-ui
 *
 * Everything both 9ri3a apps have in common: the Moroccan warm design system,
 * the RTL and Arabic formatting helpers, the typed API client with its React
 * Query hooks, and the component library the screens are assembled from.
 *
 * Consumed as TypeScript source — Metro transpiles it, so there is no build
 * step and edits here are live in both apps immediately.
 */

// --- theme -------------------------------------------------------------------
export {
  brand,
  buildTheme,
  fontFamily,
  motion,
  radius,
  shadows,
  spacing,
  ThemeProvider,
  typography,
  useTheme,
  useThemedStyles,
  type AppVariant,
  type ColorScheme,
  type ShadowToken,
  type Theme,
  type ThemeColors,
  type ThemeProviderProps,
  type TypographyToken,
} from './theme/index.js';

// --- i18n --------------------------------------------------------------------
export { enableRTL, isRTL, rtl } from './i18n/rtl.js';
export {
  formatDate,
  formatDateTime,
  formatItemCount,
  formatMAD,
  formatQuantity,
  formatRelative,
  formatUnitPrice,
  pluralAr,
  truncate,
} from './i18n/format.js';
export {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  orderStatusLabel,
  orderStatusTone,
  type OrderStatusPresentation,
} from './i18n/orderStatus.js';

// --- api ---------------------------------------------------------------------
export { ApiClient, ApiRequestError, type ApiClientOptions } from './api/client.js';
export { ApiProvider, useApi, useApiClient, type ApiProviderProps } from './api/ApiProvider.js';
export {
  queryKeys,
  useCancelOrder,
  useCart,
  useCartMutations,
  useCreateOrder,
  useFacets,
  useOrder,
  useOrders,
  usePaymentMethods,
  useProduct,
  useProducts,
  useStartCheckout,
} from './api/hooks.js';

// --- components --------------------------------------------------------------
export * from './components/index.js';

// --- types -------------------------------------------------------------------
export type * from './types.js';
