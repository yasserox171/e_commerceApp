import type { PoolClient } from 'pg';

import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import type { Paginated } from '../../lib/http.js';
import { round2 } from '../../lib/money.js';
import { generateOrderReference } from '../../lib/reference.js';
import type { AuthUser } from '../auth/auth.service.js';
import { getCart } from '../cart/cart.repo.js';
import type { Channel } from '../products/product.mapper.js';
import type { PriceTier } from '../products/pricing.js';
import type { CallbackResult, CheckoutAddress } from '../payments/provider.js';

export type OrderStatus =
  | 'pending_payment'
  | 'awaiting_approval'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentMethod = 'card' | 'bank_transfer';

export interface ShippingAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | undefined;
  city: string;
  region?: string | undefined;
  postalCode?: string | undefined;
  countryCode?: string | undefined;
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
  shippingAddress: ShippingAddressInput | null;
  customerNote: string | null;
  events: OrderEvent[];
  payments: OrderPayment[];
}

interface OrderRow {
  id: string;
  reference: string;
  channel: Channel;
  status: OrderStatus;
  payment_method: PaymentMethod;
  currency: string;
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  total: number;
  shipping_address: ShippingAddressInput | null;
  customer_note: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  placed_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | number;
  title: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  pricing_tier: PriceTier | null;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

function mapItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: String(row.product_id),
    title: row.title,
    imageUrl: row.image_url,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    lineTotal: Number(row.line_total),
    pricingTier: row.pricing_tier,
  };
}

function mapSummary(row: OrderRow, items: OrderItemRow[]): OrderSummary {
  return {
    id: row.id,
    reference: row.reference,
    channel: row.channel,
    status: row.status,
    paymentMethod: row.payment_method,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    shippingTotal: Number(row.shipping_total),
    discountTotal: Number(row.discount_total),
    total: Number(row.total),
    itemCount: items.length,
    unitCount: items.reduce((total, item) => total + item.quantity, 0),
    thumbnails: items
      .map((item) => item.image_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 4),
    trackingCarrier: row.tracking_carrier,
    trackingNumber: row.tracking_number,
    placedAt: iso(row.placed_at),
    shippedAt: iso(row.shipped_at),
    deliveredAt: iso(row.delivered_at),
    cancelledAt: iso(row.cancelled_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Creating an order
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  shippingAddress: ShippingAddressInput;
  customerNote?: string | undefined;
  /** Wholesale buyers may settle by bank transfer; retail may not. */
  paymentMethod?: PaymentMethod | undefined;
}

/**
 * Turns the signed-in user's cart into an order.
 *
 * Everything is re-priced from the live catalogue inside the transaction — the
 * client never supplies a price, only product ids and quantities. Wholesale
 * minimums are enforced here as well as in the UI.
 */
export async function createOrderFromCart(user: AuthUser, input: CreateOrderInput): Promise<OrderDetail> {
  const channel = user.accountType;
  const cart = await getCart(user.id, channel);

  if (cart.lines.length === 0) {
    throw ApiError.badRequest('السلة فارغة');
  }
  if (cart.issues.length > 0) {
    throw ApiError.unprocessable('لا يمكن إتمام الطلب', cart.issues);
  }

  // Retail is prepaid card only — this mirrors the CHECK constraint on
  // commerce.orders, so a client that ignores the UI still cannot get COD.
  const paymentMethod: PaymentMethod =
    channel === 'dropshipping' ? 'card' : (input.paymentMethod ?? 'card');
  if (channel === 'dropshipping' && paymentMethod !== 'card') {
    throw ApiError.badRequest('الدفع ببطاقة مسبقة الدفع فقط — الدفع عند الاستلام غير متاح');
  }

  const subtotal = cart.subtotal;
  const shippingTotal = channel === 'dropshipping' ? round2(env.SHIPPING_FLAT_RATE_MAD) : 0;
  const total = round2(subtotal + shippingTotal);

  if (env.MIN_ORDER_TOTAL_MAD > 0 && total < env.MIN_ORDER_TOTAL_MAD) {
    throw ApiError.unprocessable(
      `الحد الأدنى للطلب هو ${env.MIN_ORDER_TOTAL_MAD} درهم — المجموع الحالي ${total} درهم`,
    );
  }

  // A card order waits for the gateway; a wholesale bank transfer goes to the
  // sales desk for approval instead.
  const initialStatus: OrderStatus = paymentMethod === 'card' ? 'pending_payment' : 'awaiting_approval';

  const orderId = await withTransaction(async (client) => {
    const reference = await allocateReference(client, channel);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO commerce.orders
         (reference, user_id, channel, status, payment_method, currency,
          subtotal, shipping_total, discount_total, total,
          shipping_address, customer_note, placed_at)
       VALUES ($1, $2, $3, $4, $5, 'MAD', $6, $7, 0, $8, $9, $10, now())
       RETURNING id`,
      [
        reference,
        user.id,
        channel,
        initialStatus,
        paymentMethod,
        subtotal,
        shippingTotal,
        total,
        JSON.stringify({ countryCode: 'MA', ...input.shippingAddress }),
        input.customerNote ?? null,
      ],
    );
    const newOrderId = rows[0]!.id;

    for (const line of cart.lines) {
      await client.query(
        `INSERT INTO commerce.order_items
           (order_id, product_id, title, image_url, unit_price, quantity, line_total, pricing_tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newOrderId,
          line.productId,
          line.product!.title,
          line.product!.primaryImage,
          line.unitPrice,
          line.quantity,
          line.lineTotal,
          line.tier ? JSON.stringify(line.tier) : null,
        ],
      );
    }

    await client.query(
      `INSERT INTO commerce.order_events (order_id, status, note, created_by)
       VALUES ($1, $2, $3, 'system')`,
      [newOrderId, initialStatus, initialStatus === 'pending_payment' ? 'في انتظار الدفع' : 'في انتظار موافقة المبيعات'],
    );

    // The cart is emptied with the order so a refresh cannot place it twice.
    await client.query(
      `DELETE FROM commerce.cart_items ci
         USING commerce.carts c
        WHERE ci.cart_id = c.id AND c.user_id = $1 AND c.channel = $2`,
      [user.id, channel],
    );

    return newOrderId;
  });

  const order = await getOrder(user.id, orderId);
  if (!order) throw ApiError.internal('Order was created but could not be read back');
  return order;
}

/** References are random, so a collision just means trying again. */
async function allocateReference(client: PoolClient, channel: Channel): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = generateOrderReference(channel);
    const { rows } = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM commerce.orders WHERE reference = $1) AS exists',
      [reference],
    );
    if (!rows[0]?.exists) return reference;
  }
  throw ApiError.internal('Could not allocate a unique order reference');
}

// ---------------------------------------------------------------------------
// Reading orders
// ---------------------------------------------------------------------------

export async function listOrders(
  userId: string,
  channel: Channel,
  page: number,
  pageSize: number,
): Promise<Paginated<OrderSummary>> {
  const { rows } = await query<OrderRow & { total_count: number }>(
    `SELECT o.*, COUNT(*) OVER () AS total_count
       FROM commerce.orders o
      WHERE o.user_id = $1 AND o.channel = $2
      ORDER BY o.created_at DESC
      LIMIT $3 OFFSET $4`,
    [userId, channel, pageSize, (page - 1) * pageSize],
  );

  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  const itemsByOrder = await loadItems(rows.map((row) => row.id));

  const totalPages = Math.ceil(total / pageSize);
  return {
    items: rows.map((row) => mapSummary(row, itemsByOrder.get(row.id) ?? [])),
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

async function loadItems(orderIds: string[]): Promise<Map<string, OrderItemRow[]>> {
  const grouped = new Map<string, OrderItemRow[]>();
  if (orderIds.length === 0) return grouped;

  const { rows } = await query<OrderItemRow>(
    `SELECT * FROM commerce.order_items
      WHERE order_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [orderIds],
  );
  for (const row of rows) {
    const bucket = grouped.get(row.order_id);
    if (bucket) bucket.push(row);
    else grouped.set(row.order_id, [row]);
  }
  return grouped;
}

export async function getOrder(userId: string, orderId: string): Promise<OrderDetail | null> {
  const { rows } = await query<OrderRow>(
    'SELECT * FROM commerce.orders WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return hydrate(row);
}

export async function getOrderByReference(reference: string): Promise<OrderRow | null> {
  const { rows } = await query<OrderRow>('SELECT * FROM commerce.orders WHERE reference = $1', [reference]);
  return rows[0] ?? null;
}

async function hydrate(row: OrderRow): Promise<OrderDetail> {
  const [items, events, payments] = await Promise.all([
    query<OrderItemRow>(
      'SELECT * FROM commerce.order_items WHERE order_id = $1 ORDER BY created_at ASC',
      [row.id],
    ),
    query<{ id: number; status: OrderStatus; note: string | null; created_at: Date }>(
      'SELECT id, status, note, created_at FROM commerce.order_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC',
      [row.id],
    ),
    query<{
      id: string;
      provider: string;
      provider_ref: string | null;
      status: string;
      amount: number;
      failure_reason: string | null;
      created_at: Date;
    }>(
      `SELECT id, provider, provider_ref, status, amount, failure_reason, created_at
         FROM commerce.payments WHERE order_id = $1 ORDER BY created_at ASC`,
      [row.id],
    ),
  ]);

  return {
    ...mapSummary(row, items.rows),
    items: items.rows.map(mapItem),
    shippingAddress: row.shipping_address,
    customerNote: row.customer_note,
    events: events.rows.map((event) => ({
      id: event.id,
      status: event.status,
      note: event.note,
      createdAt: event.created_at.toISOString(),
    })),
    payments: payments.rows.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerRef: payment.provider_ref,
      status: payment.status,
      amount: Number(payment.amount),
      failureReason: payment.failure_reason,
      createdAt: payment.created_at.toISOString(),
    })),
  };
}

export async function cancelOrder(userId: string, orderId: string): Promise<OrderDetail> {
  const order = await getOrder(userId, orderId);
  if (!order) throw ApiError.notFound('Order not found');

  // Once the warehouse has it, cancelling is a support conversation, not a
  // self-service button.
  if (!['pending_payment', 'awaiting_approval'].includes(order.status)) {
    throw ApiError.conflict('لا يمكن إلغاء هذا الطلب في حالته الحالية');
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE commerce.orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
      [orderId],
    );
    await client.query(
      `INSERT INTO commerce.order_events (order_id, status, note, created_by)
       VALUES ($1, 'cancelled', 'ألغاه العميل', 'customer')`,
      [orderId],
    );
  });

  const updated = await getOrder(userId, orderId);
  return updated!;
}

// ---------------------------------------------------------------------------
// Payment settlement
// ---------------------------------------------------------------------------

export interface SettlementOutcome {
  orderId: string;
  reference: string;
  status: OrderStatus;
  alreadySettled: boolean;
}

/**
 * Applies a verified gateway callback. Idempotent: gateways retry, and the
 * shopper's browser return often races the server-to-server callback, so the
 * same result may arrive two or three times.
 */
export async function applySettlement(
  providerId: string,
  result: CallbackResult,
): Promise<SettlementOutcome> {
  const order = await getOrderByReference(result.reference);
  if (!order) throw ApiError.notFound(`No order with reference ${result.reference}`);

  // A callback that disagrees with the stored total is a red flag; never let it
  // mark the order paid.
  if (result.status === 'paid' && result.amount !== null && Math.abs(result.amount - Number(order.total)) > 0.01) {
    throw ApiError.unprocessable(
      `Amount mismatch for ${result.reference}: gateway reported ${result.amount}, order total is ${order.total}`,
    );
  }

  const alreadySettled = !['pending_payment'].includes(order.status);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO commerce.payments
         (order_id, provider, provider_ref, status, amount, currency, raw_response, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status,
                     raw_response = EXCLUDED.raw_response,
                     failure_reason = EXCLUDED.failure_reason`,
      [
        order.id,
        providerId,
        result.providerRef,
        result.status === 'paid' ? 'paid' : result.status === 'authorized' ? 'authorized' : result.status,
        result.amount ?? order.total,
        order.currency,
        JSON.stringify(result.raw),
        result.failureReason,
      ],
    );

    if (alreadySettled) return;

    if (result.status === 'paid' || result.status === 'authorized') {
      await client.query(
        `UPDATE commerce.orders SET status = 'processing' WHERE id = $1 AND status = 'pending_payment'`,
        [order.id],
      );
      await client.query(
        `INSERT INTO commerce.order_events (order_id, status, note, created_by)
         VALUES ($1, 'processing', $2, 'payment')`,
        [order.id, `تم الدفع عبر ${providerId.toUpperCase()}`],
      );
    } else if (result.status === 'cancelled') {
      await client.query(
        `UPDATE commerce.orders SET status = 'cancelled', cancelled_at = now()
          WHERE id = $1 AND status = 'pending_payment'`,
        [order.id],
      );
      await client.query(
        `INSERT INTO commerce.order_events (order_id, status, note, created_by)
         VALUES ($1, 'cancelled', 'ألغى العميل عملية الدفع', 'payment')`,
        [order.id],
      );
    } else {
      // A declined card leaves the order payable so the shopper can retry with
      // another one; only the failure is recorded.
      await client.query(
        `INSERT INTO commerce.order_events (order_id, status, note, created_by)
         VALUES ($1, 'pending_payment', $2, 'payment')`,
        [order.id, `فشل الدفع: ${result.failureReason ?? 'سبب غير معروف'}`],
      );
    }
  });

  const refreshed = await getOrderByReference(result.reference);
  return {
    orderId: order.id,
    reference: order.reference,
    status: refreshed?.status ?? order.status,
    alreadySettled,
  };
}

export function toCheckoutAddress(address: ShippingAddressInput | null): CheckoutAddress | null {
  if (!address) return null;
  return {
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    postalCode: address.postalCode ?? null,
    countryCode: address.countryCode ?? 'MA',
  };
}
