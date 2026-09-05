import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import type { Paginated } from '../../lib/http.js';
import {
  mapProductDetail,
  mapProductSummary,
  type Channel,
  type ProductDetail,
  type ProductRow,
  type ProductSummary,
} from './product.mapper.js';

/** Postgres "invalid input syntax for type …" — a malformed id, not a failure. */
const INVALID_TEXT_REPRESENTATION = '22P02';

export type ProductSort = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'title';

export interface ProductQuery {
  channel: Channel;
  search?: string | undefined;
  supplier?: string | undefined;
  subcategory?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sort: ProductSort;
  page: number;
  pageSize: number;
}

const SELECT_COLUMNS = `
  p.id,
  p.edited_images,
  p.generated_title,
  p.generated_description,
  p.price,
  p.category,
  p.extra_info,
  p.status,
  p.created_at,
  p.updated_at
`;

// The ingestion pipeline is inconsistent about which key holds the supplier or
// the subcategory, so both filtering and faceting read through the same
// COALESCE chain the mapper uses.
const SUPPLIER_EXPR = `COALESCE(
  NULLIF(p.extra_info->>'supplier', ''),
  NULLIF(p.extra_info->>'vendor', ''),
  NULLIF(p.extra_info->>'supplier_name', ''),
  NULLIF(p.extra_info->>'brand', ''),
  NULLIF(p.extra_info->>'manufacturer', '')
)`;

const SUBCATEGORY_EXPR = `COALESCE(
  NULLIF(p.extra_info->>'subcategory', ''),
  NULLIF(p.extra_info->>'sub_category', ''),
  NULLIF(p.extra_info->>'product_type', ''),
  NULLIF(p.extra_info->>'type', ''),
  NULLIF(p.extra_info->>'collection', '')
)`;

const ORDER_BY: Record<ProductSort, string> = {
  newest: 'p.created_at DESC NULLS LAST, p.id DESC',
  oldest: 'p.created_at ASC NULLS LAST, p.id ASC',
  price_asc: 'p.price ASC NULLS LAST, p.id DESC',
  price_desc: 'p.price DESC NULLS LAST, p.id DESC',
  title: 'p.generated_title ASC NULLS LAST, p.id DESC',
};

interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildWhere(filters: ProductQuery): WhereClause {
  const conditions: string[] = ['p.category = $1'];
  const params: unknown[] = [filters.channel];

  const hidden = env.PRODUCT_HIDDEN_STATUSES;
  if (hidden.length > 0) {
    params.push(hidden);
    conditions.push(`(p.status IS NULL OR NOT (lower(p.status) = ANY($${params.length}::text[])))`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const placeholder = `$${params.length}`;
    conditions.push(
      `(p.generated_title ILIKE ${placeholder} OR p.generated_description ILIKE ${placeholder})`,
    );
  }

  if (filters.supplier) {
    params.push(filters.supplier);
    conditions.push(`${SUPPLIER_EXPR} = $${params.length}`);
  }

  if (filters.subcategory) {
    params.push(filters.subcategory);
    conditions.push(`${SUBCATEGORY_EXPR} = $${params.length}`);
  }

  if (filters.minPrice !== undefined) {
    params.push(filters.minPrice);
    conditions.push(`p.price >= $${params.length}`);
  }

  if (filters.maxPrice !== undefined) {
    params.push(filters.maxPrice);
    conditions.push(`p.price <= $${params.length}`);
  }

  return { sql: conditions.join('\n    AND '), params };
}

export async function listProducts(filters: ProductQuery): Promise<Paginated<ProductSummary>> {
  const where = buildWhere(filters);
  const params = [...where.params];

  params.push(filters.pageSize);
  const limitPlaceholder = `$${params.length}`;
  params.push((filters.page - 1) * filters.pageSize);
  const offsetPlaceholder = `$${params.length}`;

  // COUNT(*) OVER () gives the total in the same round trip as the page.
  const sql = `
    SELECT ${SELECT_COLUMNS},
           COUNT(*) OVER () AS total_count
      FROM public.products p
     WHERE ${where.sql}
     ORDER BY ${ORDER_BY[filters.sort]}
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const { rows } = await query<ProductRow & { total_count: number }>(sql, params);
  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return {
    items: rows.map(mapProductSummary),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages,
    hasMore: filters.page < totalPages,
  };
}

export async function findProductById(id: string, channel?: Channel): Promise<ProductDetail | null> {
  const params: unknown[] = [id];
  let sql = `
    SELECT ${SELECT_COLUMNS}
      FROM public.products p
     WHERE p.id = $1
  `;
  if (channel) {
    params.push(channel);
    sql += ` AND p.category = $${params.length}`;
  }
  sql += ' LIMIT 1';

  try {
    const { rows } = await query<ProductRow>(sql, params);
    return rows[0] ? mapProductDetail(rows[0]) : null;
  } catch (error) {
    // `/products/not-a-number` should 404, not 500.
    if ((error as { code?: string }).code === INVALID_TEXT_REPRESENTATION) return null;
    throw error;
  }
}

/**
 * Bulk lookup used when pricing a cart or an order. Returns only the products
 * that exist in the given channel; the caller decides what a missing id means.
 */
export async function findProductsByIds(ids: string[], channel: Channel): Promise<Map<string, ProductDetail>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const sql = `
    SELECT ${SELECT_COLUMNS}
      FROM public.products p
     WHERE p.id::text = ANY($1::text[])
       AND p.category = $2
  `;

  const { rows } = await query<ProductRow>(sql, [unique, channel]);
  return new Map(rows.map((row) => [String(row.id), mapProductDetail(row)]));
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

/** Powers the filter sheet: which suppliers / categories actually have stock. */
export async function getFacets(channel: Channel, search?: string): Promise<ProductFacets> {
  const base = buildWhere({
    channel,
    search,
    sort: 'newest',
    page: 1,
    pageSize: 1,
  });

  const facetSql = (expression: string) => `
    SELECT ${expression} AS value, COUNT(*)::int AS count
      FROM public.products p
     WHERE ${base.sql}
       AND ${expression} IS NOT NULL
     GROUP BY 1
     ORDER BY count DESC, value ASC
     LIMIT 60
  `;

  const [suppliers, subcategories, stats] = await Promise.all([
    query<FacetValue>(facetSql(SUPPLIER_EXPR), base.params),
    query<FacetValue>(facetSql(SUBCATEGORY_EXPR), base.params),
    query<{ min: number | null; max: number | null; total: number }>(
      `SELECT MIN(p.price) AS min, MAX(p.price) AS max, COUNT(*)::int AS total
         FROM public.products p
        WHERE ${base.sql}`,
      base.params,
    ),
  ]);

  const row = stats.rows[0];
  const priceRange =
    row && row.min !== null && row.max !== null
      ? { min: Number(row.min), max: Number(row.max) }
      : null;

  return {
    suppliers: suppliers.rows,
    subcategories: subcategories.rows,
    priceRange,
    total: row?.total ?? 0,
  };
}
