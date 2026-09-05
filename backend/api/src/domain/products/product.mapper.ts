import {
  asRecord,
  collectAdditionalSpecs,
  EXTRA_INFO_KEYS,
  pickNumber,
  pickString,
  pickStringArray,
  type SpecEntry,
} from './extra-info.js';
import { resolvePricing, type PriceTier } from './pricing.js';

/** Raw shape of a `public.products` row as pg hands it back. */
export interface ProductRow {
  id: number | string;
  edited_images: string[] | null;
  generated_title: string | null;
  generated_description: string | null;
  price: number | null;
  category: string | null;
  extra_info: unknown;
  status: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

export type Channel = 'wholesale' | 'dropshipping';

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
}

const IMAGE_URL_PATTERN = /^(https?:\/\/|data:image\/)/i;

/**
 * `edited_images` is `text[]`; entries may be empty strings or relative paths
 * depending on the ingestion run. Keep only what an <Image> can actually load.
 */
function normaliseImages(images: string[] | null): string[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of images) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url || !IMAGE_URL_PATTERN.test(url) || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normaliseChannel(category: string | null): Channel {
  return category === 'wholesale' ? 'wholesale' : 'dropshipping';
}

export function mapProductSummary(row: ProductRow): ProductSummary {
  const extra = asRecord(row.extra_info);
  const pricing = resolvePricing(row.price, row.extra_info);
  const images = normaliseImages(row.edited_images);
  const stock = pickNumber(extra, [...EXTRA_INFO_KEYS.stock]);

  const discountPercent =
    pricing.compareAtPrice && pricing.compareAtPrice > pricing.unitPrice
      ? Math.round(((pricing.compareAtPrice - pricing.unitPrice) / pricing.compareAtPrice) * 100)
      : null;

  return {
    id: String(row.id),
    // A product with no generated title still has to be renderable; the apps
    // show this fallback rather than an empty card.
    title: row.generated_title?.trim() || `منتج #${row.id}`,
    images,
    primaryImage: images[0] ?? null,
    price: pricing.unitPrice,
    compareAtPrice: pricing.compareAtPrice,
    discountPercent,
    currency: 'MAD',
    channel: normaliseChannel(row.category),
    status: row.status,
    supplier: pickString(extra, [...EXTRA_INFO_KEYS.supplier]),
    subcategory: pickString(extra, [...EXTRA_INFO_KEYS.subcategory]),
    tags: pickStringArray(extra, [...EXTRA_INFO_KEYS.tags]),
    unit: pickString(extra, [...EXTRA_INFO_KEYS.unit]),
    stock,
    // Unknown stock is treated as available: the pipeline often omits it, and
    // hiding the whole catalogue because a field is missing is worse than
    // failing at order time.
    inStock: stock === null ? true : stock > 0,
    minOrderQuantity: pricing.minOrderQuantity,
    tiers: pricing.tiers,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function mapProductDetail(row: ProductRow): ProductDetail {
  const extra = asRecord(row.extra_info);
  return {
    ...mapProductSummary(row),
    description: row.generated_description?.trim() ?? '',
    sku: pickString(extra, [...EXTRA_INFO_KEYS.sku]),
    colors: pickStringArray(extra, [...EXTRA_INFO_KEYS.colors]),
    sizes: pickStringArray(extra, [...EXTRA_INFO_KEYS.sizes]),
    shippingDays: pickNumber(extra, [...EXTRA_INFO_KEYS.shippingDays]),
    weightGrams: pickNumber(extra, [...EXTRA_INFO_KEYS.weightGrams]),
    specs: collectAdditionalSpecs(extra),
  };
}
