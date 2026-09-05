import type { PoolClient } from 'pg';

import { pool, query } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { round2, sum } from '../../lib/money.js';
import type { Channel, ProductDetail } from '../products/product.mapper.js';
import { findProductsByIds } from '../products/products.repo.js';
import { unitPriceFor, type PriceTier } from '../products/pricing.js';

const INVALID_TEXT_REPRESENTATION = '22P02';

export interface CartLine {
  id: string;
  productId: string;
  quantity: number;
  /** null when the product left the catalogue after it was added. */
  product: ProductDetail | null;
  unitPrice: number;
  lineTotal: number;
  tier: PriceTier | null;
  /** Next quantity break, so the wholesale app can nudge "add N more". */
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
  /** Human-readable reasons checkout would be refused right now. */
  issues: string[];
}

interface CartItemRow {
  id: string;
  product_id: string | number;
  quantity: number;
}

/** Hard ceiling per line, so a typo can't create a 10-million-unit order. */
export const MAX_LINE_QUANTITY = 100_000;

async function findOrCreateCart(userId: string, channel: Channel, client?: PoolClient): Promise<string> {
  const run = <T extends Record<string, unknown>>(text: string, params: unknown[]) =>
    client ? client.query<T>(text, params as never[]) : query<T>(text, params);

  const existing = await run<{ id: string }>(
    'SELECT id FROM commerce.carts WHERE user_id = $1 AND channel = $2',
    [userId, channel],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  // ON CONFLICT covers two devices adding the first item at the same moment.
  const created = await run<{ id: string }>(
    `INSERT INTO commerce.carts (user_id, channel)
     VALUES ($1, $2)
     ON CONFLICT (user_id, channel) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId, channel],
  );
  return created.rows[0]!.id;
}

/**
 * Reads the cart and re-prices every line against the live catalogue. Prices
 * are never trusted from the client, and a product that disappeared shows up as
 * an unavailable line instead of silently vanishing from the total.
 */
export async function getCart(userId: string, channel: Channel): Promise<CartView> {
  const cartId = await findOrCreateCart(userId, channel);

  const { rows } = await query<CartItemRow>(
    `SELECT id, product_id, quantity
       FROM commerce.cart_items
      WHERE cart_id = $1
      ORDER BY created_at ASC`,
    [cartId],
  );

  const products = await findProductsByIds(
    rows.map((row) => String(row.product_id)),
    channel,
  );

  const lines: CartLine[] = rows.map((row) => {
    const productId = String(row.product_id);
    const product = products.get(productId) ?? null;

    if (!product) {
      return {
        id: row.id,
        productId,
        quantity: row.quantity,
        product: null,
        unitPrice: 0,
        lineTotal: 0,
        tier: null,
        nextTier: null,
        minOrderQuantity: 1,
        meetsMinimum: false,
        available: false,
      };
    }

    const match = unitPriceFor(
      {
        unitPrice: product.price,
        minOrderQuantity: product.minOrderQuantity,
        tiers: product.tiers,
        compareAtPrice: product.compareAtPrice,
      },
      row.quantity,
    );

    return {
      id: row.id,
      productId,
      quantity: row.quantity,
      product,
      unitPrice: match.unitPrice,
      lineTotal: round2(match.unitPrice * row.quantity),
      tier: match.tier,
      nextTier: match.nextTier,
      minOrderQuantity: product.minOrderQuantity,
      meetsMinimum: row.quantity >= product.minOrderQuantity,
      available: product.inStock,
    };
  });

  const issues: string[] = [];
  for (const line of lines) {
    if (!line.product) {
      issues.push(`المنتج ${line.productId} لم يعد متوفراً — احذفه من السلة`);
    } else if (!line.available) {
      issues.push(`«${line.product.title}» نفد من المخزون`);
    } else if (!line.meetsMinimum) {
      issues.push(
        `«${line.product.title}» يتطلب حداً أدنى ${line.minOrderQuantity} — الكمية الحالية ${line.quantity}`,
      );
    }
  }

  return {
    id: cartId,
    channel,
    lines,
    itemCount: lines.length,
    unitCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal: sum(lines.map((line) => line.lineTotal)),
    currency: 'MAD',
    issues,
  };
}

export async function addItem(
  userId: string,
  channel: Channel,
  productId: string,
  quantity: number,
): Promise<CartView> {
  const products = await findProductsByIds([productId], channel);
  const product = products.get(productId);
  if (!product) throw ApiError.notFound('Product not found in this catalogue');
  if (!product.inStock) throw ApiError.conflict('This product is out of stock');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cartId = await findOrCreateCart(userId, channel, client);

    // Adding the same product twice adds to the quantity rather than creating a
    // second line — matches what a shopper expects.
    const { rows } = await client.query<{ quantity: number }>(
      `INSERT INTO commerce.cart_items (cart_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = commerce.cart_items.quantity + EXCLUDED.quantity
       RETURNING quantity`,
      [cartId, productId, quantity],
    );

    const newQuantity = rows[0]!.quantity;
    if (newQuantity > MAX_LINE_QUANTITY) {
      throw ApiError.badRequest(`Quantity cannot exceed ${MAX_LINE_QUANTITY} per product`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === INVALID_TEXT_REPRESENTATION) {
      throw ApiError.notFound('Product not found');
    }
    throw error;
  } finally {
    client.release();
  }

  return getCart(userId, channel);
}

export async function updateItemQuantity(
  userId: string,
  channel: Channel,
  itemId: string,
  quantity: number,
): Promise<CartView> {
  const { rowCount } = await query(
    `UPDATE commerce.cart_items ci
        SET quantity = $3
       FROM commerce.carts c
      WHERE ci.cart_id = c.id
        AND ci.id = $1
        AND c.user_id = $2
        AND c.channel = $4`,
    [itemId, userId, quantity, channel],
  );

  if (!rowCount) throw ApiError.notFound('Cart item not found');
  return getCart(userId, channel);
}

export async function removeItem(userId: string, channel: Channel, itemId: string): Promise<CartView> {
  const { rowCount } = await query(
    `DELETE FROM commerce.cart_items ci
       USING commerce.carts c
      WHERE ci.cart_id = c.id
        AND ci.id = $1
        AND c.user_id = $2
        AND c.channel = $3`,
    [itemId, userId, channel],
  );

  if (!rowCount) throw ApiError.notFound('Cart item not found');
  return getCart(userId, channel);
}

export async function clearCart(userId: string, channel: Channel): Promise<CartView> {
  await query(
    `DELETE FROM commerce.cart_items ci
       USING commerce.carts c
      WHERE ci.cart_id = c.id AND c.user_id = $1 AND c.channel = $2`,
    [userId, channel],
  );
  return getCart(userId, channel);
}
