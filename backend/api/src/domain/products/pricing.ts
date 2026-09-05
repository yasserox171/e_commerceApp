import { round2 } from '../../lib/money.js';
import { asRecord, EXTRA_INFO_KEYS, pickNumber, type JsonRecord } from './extra-info.js';

export interface PriceTier {
  /** Smallest quantity that unlocks `unitPrice`. */
  minQuantity: number;
  unitPrice: number;
}

export interface PricingModel {
  /** Unit price a single item costs — what the retail app shows. */
  unitPrice: number;
  /** Minimum quantity the wholesale app will let a buyer order. */
  minOrderQuantity: number;
  /** Ascending, de-duplicated quantity breaks. Always has at least one entry. */
  tiers: PriceTier[];
  /** Price before discount, when the pipeline provides one. */
  compareAtPrice: number | null;
}

const MAX_TIERS = 12;

/**
 * Builds a usable pricing model from whatever `extra_info` happens to contain.
 *
 * Two tier shapes are accepted:
 *   [{ min_quantity: 12, unit_price: 45 }, …]        (preferred)
 *   { "12": 45, "60": 41.5 }                          (quantity → price map)
 *
 * When neither is present the model degrades to a single tier built from
 * `products.price`, so a product with an empty `extra_info` is still orderable.
 */
export function resolvePricing(price: number | null, extraInfo: unknown): PricingModel {
  const record = asRecord(extraInfo);
  const basePrice = typeof price === 'number' && Number.isFinite(price) && price >= 0 ? round2(price) : 0;

  const parsedTiers = parseTiers(record);
  const declaredMoq = pickNumber(record, [...EXTRA_INFO_KEYS.minOrderQuantity]);

  // A supplier who publishes a "12+ → 45 MAD" ladder without stating a minimum
  // means 12 IS the minimum; inventing a cheaper tier at quantity 1 would sell
  // below the published ladder.
  const lowestTierQuantity =
    parsedTiers.length > 0 ? Math.min(...parsedTiers.map((tier) => tier.minQuantity)) : null;

  const minOrderQuantity =
    declaredMoq !== null && declaredMoq >= 1
      ? Math.floor(declaredMoq)
      : (lowestTierQuantity ?? 1);

  const tiers = normaliseTiers(parsedTiers, minOrderQuantity, basePrice);

  const compareAt = pickNumber(record, [...EXTRA_INFO_KEYS.retailPrice]);
  const compareAtPrice =
    compareAt !== null && compareAt > basePrice ? round2(compareAt) : null;

  return {
    // The unit price is the cheapest entry point, i.e. the first tier.
    unitPrice: tiers[0]!.unitPrice,
    minOrderQuantity,
    tiers,
    compareAtPrice,
  };
}

function parseTiers(record: JsonRecord | null): PriceTier[] {
  if (!record) return [];

  const raw = findTierValue(record);
  if (raw === undefined) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        const tier = asRecord(entry);
        if (!tier) return null;
        const minQuantity = pickNumber(tier, ['min_quantity', 'min_qty', 'from', 'qty', 'quantity', 'min']);
        const unitPrice = pickNumber(tier, ['unit_price', 'price', 'unit', 'amount', 'value']);
        if (minQuantity === null || unitPrice === null) return null;
        return { minQuantity: Math.max(1, Math.floor(minQuantity)), unitPrice: round2(unitPrice) };
      })
      .filter((tier): tier is PriceTier => tier !== null && tier.unitPrice >= 0);
  }

  const map = asRecord(raw);
  if (map) {
    return Object.entries(map)
      .map(([quantity, unitPrice]) => {
        const parsedQuantity = Number.parseInt(quantity, 10);
        const parsedPrice =
          typeof unitPrice === 'number'
            ? unitPrice
            : typeof unitPrice === 'string'
              ? Number.parseFloat(unitPrice)
              : Number.NaN;
        if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedPrice)) return null;
        return { minQuantity: Math.max(1, parsedQuantity), unitPrice: round2(parsedPrice) };
      })
      .filter((tier): tier is PriceTier => tier !== null && tier.unitPrice >= 0);
  }

  return [];
}

function findTierValue(record: JsonRecord): unknown {
  const normalise = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '');
  const wanted = new Set(EXTRA_INFO_KEYS.priceTiers.map(normalise));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalise(key))) return value;
  }
  return undefined;
}

/**
 * Sorts ascending by quantity, drops duplicates, and guarantees a tier that
 * covers the minimum order quantity so `unitPriceFor` can never come up empty.
 */
function normaliseTiers(tiers: PriceTier[], minOrderQuantity: number, basePrice: number): PriceTier[] {
  const byQuantity = new Map<number, PriceTier>();
  for (const tier of tiers) {
    const existing = byQuantity.get(tier.minQuantity);
    // Two entries for the same break: keep the cheaper one, it's what a buyer
    // would reasonably expect to be charged.
    if (!existing || tier.unitPrice < existing.unitPrice) {
      byQuantity.set(tier.minQuantity, tier);
    }
  }

  const sorted = [...byQuantity.values()]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .slice(0, MAX_TIERS);

  if (sorted.length === 0) {
    return [{ minQuantity: minOrderQuantity, unitPrice: basePrice }];
  }

  // A tier list that starts above the MOQ would leave the MOQ itself unpriced.
  if (sorted[0]!.minQuantity > minOrderQuantity) {
    sorted.unshift({ minQuantity: minOrderQuantity, unitPrice: sorted[0]!.unitPrice });
  }
  return sorted;
}

export interface TierMatch {
  unitPrice: number;
  tier: PriceTier;
  /** The next break, so the app can show "order N more for X MAD/unit". */
  nextTier: PriceTier | null;
}

/** Highest tier whose `minQuantity` the requested quantity reaches. */
export function unitPriceFor(pricing: PricingModel, quantity: number): TierMatch {
  const { tiers } = pricing;
  let matched = tiers[0]!;
  let matchedIndex = 0;

  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]!;
    if (quantity >= tier.minQuantity) {
      matched = tier;
      matchedIndex = i;
    } else {
      break;
    }
  }

  return {
    unitPrice: matched.unitPrice,
    tier: matched,
    nextTier: tiers[matchedIndex + 1] ?? null,
  };
}

export function lineTotalFor(pricing: PricingModel, quantity: number): number {
  return round2(unitPriceFor(pricing, quantity).unitPrice * quantity);
}
