/**
 * Response shapes returned by @ecommerce/api.
 *
 * These mirror the interfaces in backend/api/src/domain/**. They are declared
 * again here rather than imported so the React Native apps never pull the
 * server's Node-typed modules into their bundle; the two are kept in step by
 * hand, and every field below is exercised by at least one screen.
 */

export type Channel = 'wholesale' | 'dropshipping';

export interface PriceTier {
  minQuantity: number;
  unitPrice: number;
}

export interface SpecEntry {
  key: string;
  label: string;
  value: string;
}

export interface ProductSummary {
  id: string;
  title: string;
  images: string[];
  primaryImage: string | null;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  currency: 'MAD';
  channel: Channel;
  status: string | null;
  supplier: string | null;
  subcategory: string | null;
  tags: string[];
  unit: string | null;
  stock: number | null;
  inStock: boolean;
  minOrderQuantity: number;
  tiers: PriceTier[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  sku: string | null;
  colors: string[];
  sizes: string[];
  shippingDays: number | null;
  weightGrams: number | null;
  specs: SpecEntry[];
  quote?: ProductQuote;
}

export interface ProductQuote {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  tier: PriceTier;
  nextTier: PriceTier | null;
  meetsMinimum: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface ProductFacets {
  suppliers: FacetValue[];
  subcategories: FacetValue[];
  priceRange: { min: number; max: number } | null;
  total: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  accountType: Channel;
  businessName: string | null;
  iceNumber: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface CartLine {
  id: string;
  productId: string;
  quantity: number;
  product: ProductDetail | null;
  unitPrice: number;
  lineTotal: number;
  tier: PriceTier | null;
  nextTier: PriceTier | null;
  minOrderQuantity: number;
  meetsMinimum: boolean;
  available: boolean;
}

export interface CartView {
  id: string;
  channel: Channel;
  lines: CartLine[];
  itemCount: number;
  unitCount: number;
  subtotal: number;
  currency: 'MAD';
  issues: string[];
}

export type OrderStatus =
  | 'pending_payment'
  | 'awaiting_approval'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentMethod = 'card' | 'bank_transfer';

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  pricingTier: PriceTier | null;
}

export interface OrderEvent {
  id: number;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface OrderPayment {
  id: string;
  provider: string;
  providerRef: string | null;
  status: string;
  amount: number;
  failureReason: string | null;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  reference: string;
  channel: Channel;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  itemCount: number;
  unitCount: number;
  thumbnails: string[];
  trackingCarrier: string | null;
  trackingNumber: string | null;
  placedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
  shippingAddress: ShippingAddress | null;
  customerNote: string | null;
  events: OrderEvent[];
  payments: OrderPayment[];
}

export type CheckoutInstruction =
  | { kind: 'redirect'; url: string }
  | { kind: 'form_post'; url: string; fields: Record<string, string> };

export interface CheckoutSession {
  orderId: string;
  reference: string;
  amount: number;
  currency: string;
  provider: string;
  instruction: CheckoutInstruction;
  /** The app closes its payment WebView once navigation hits this prefix. */
  returnUrlPrefix: string;
}

export interface PaymentMethodsInfo {
  active: string;
  prepaidCardOnly: boolean;
  cashOnDelivery: false;
  providers: Array<{ id: string; displayName: string; configured: boolean; active: boolean }>;
}

export type ProductSort = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'title';

export interface ProductQueryParams {
  channel: Channel;
  q?: string;
  supplier?: string;
  subcategory?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}
