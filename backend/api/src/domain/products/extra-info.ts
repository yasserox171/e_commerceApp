/**
 * `products.extra_info` is a free-form jsonb column filled by an ingestion
 * pipeline we do not control, so nothing in here may assume a key exists or
 * has a particular spelling. Every reader accepts a list of aliases and falls
 * back to a safe default — a product with an empty `extra_info` still renders
 * correctly in both apps, just without the optional detail.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

/** Case- and separator-insensitive lookup: `minOrderQty` matches `min_order_qty`. */
function lookup(record: JsonRecord, keys: string[]): unknown {
  const normalise = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '');
  const index = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    index.set(normalise(key), value);
  }
  for (const key of keys) {
    const hit = index.get(normalise(key));
    if (hit !== undefined && hit !== null && hit !== '') return hit;
  }
  return undefined;
}

export function pickString(record: JsonRecord | null, keys: string[]): string | null {
  if (!record) return null;
  const value = lookup(record, keys);
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function pickNumber(record: JsonRecord | null, keys: string[]): number | null {
  if (!record) return null;
  const value = lookup(record, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    // Tolerate "12 pcs", "45,50 MAD", "1 200" — take the first number found.
    const match = value
      .replace(/[\s\u00A0\u202F\u2009]/g, '')
      .replace(/,(\d{1,2})\b/, '.$1')
      .match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function pickBoolean(record: JsonRecord | null, keys: string[]): boolean | null {
  if (!record) return null;
  const value = lookup(record, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'oui', 'نعم'].includes(normalised)) return true;
    if (['false', 'no', '0', 'non', 'لا'].includes(normalised)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return null;
}

export function pickStringArray(record: JsonRecord | null, keys: string[]): string[] {
  if (!record) return [];
  const value = lookup(record, keys);
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : typeof entry === 'number' ? String(entry) : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

/** Aliases seen across ingestion sources, in the order we prefer them. */
export const EXTRA_INFO_KEYS = {
  minOrderQuantity: ['min_order_quantity', 'moq', 'minimum_order', 'min_qty', 'minimum_order_quantity'],
  priceTiers: ['price_tiers', 'tiers', 'wholesale_tiers', 'bulk_pricing', 'quantity_breaks', 'price_breaks'],
  supplier: ['supplier', 'vendor', 'supplier_name', 'brand', 'manufacturer'],
  subcategory: ['subcategory', 'sub_category', 'product_type', 'type', 'collection'],
  tags: ['tags', 'keywords', 'labels'],
  stock: ['stock', 'quantity_available', 'inventory', 'stock_quantity', 'available_quantity'],
  unit: ['unit', 'unit_label', 'packaging', 'uom'],
  retailPrice: ['retail_price', 'compare_at_price', 'msrp', 'original_price', 'list_price'],
  shippingDays: ['shipping_days', 'delivery_days', 'lead_time_days', 'processing_days'],
  weightGrams: ['weight_grams', 'weight_g', 'weight'],
  sku: ['sku', 'reference', 'ref', 'product_code'],
  colors: ['colors', 'color_options', 'available_colors'],
  sizes: ['sizes', 'size_options', 'available_sizes'],
} as const;

/**
 * Keys the mapper has already surfaced as first-class fields. Everything else
 * in `extra_info` is passed through to the product detail screen as a generic
 * spec list, so new pipeline fields show up in the apps with no code change.
 */
const CLAIMED_KEYS = new Set(
  Object.values(EXTRA_INFO_KEYS)
    .flat()
    .map((key) => key.toLowerCase().replace(/[\s_-]/g, '')),
);

export interface SpecEntry {
  key: string;
  label: string;
  value: string;
}

export function collectAdditionalSpecs(record: JsonRecord | null): SpecEntry[] {
  if (!record) return [];
  const specs: SpecEntry[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (CLAIMED_KEYS.has(key.toLowerCase().replace(/[\s_-]/g, ''))) continue;

    const rendered = renderSpecValue(value);
    if (rendered === null) continue;

    specs.push({ key, label: humanise(key), value: rendered });
  }
  return specs;
}

function renderSpecValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value)) {
    const parts = value.map(renderSpecValue).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join('، ') : null;
  }
  // Nested objects are shown as `key: value` pairs rather than raw JSON.
  const record = asRecord(value);
  if (record) {
    const parts = Object.entries(record)
      .map(([key, nested]) => {
        const rendered = renderSpecValue(nested);
        return rendered === null ? null : `${humanise(key)}: ${rendered}`;
      })
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join('، ') : null;
  }
  return null;
}

function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
