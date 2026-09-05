import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePricing, unitPriceFor } from './pricing.js';

/**
 * `extra_info` is written by an ingestion pipeline this codebase does not own,
 * so these cover the shapes it has been seen to emit — and, just as
 * importantly, the malformed ones it must survive.
 */
describe('resolvePricing', () => {
  it('falls back to products.price when extra_info is empty', () => {
    assert.deepEqual(resolvePricing(45, null), {
      unitPrice: 45,
      minOrderQuantity: 1,
      tiers: [{ minQuantity: 1, unitPrice: 45 }],
      compareAtPrice: null,
    });
  });

  it('reads the array tier form', () => {
    const pricing = resolvePricing(45, {
      min_order_quantity: 12,
      price_tiers: [
        { min_quantity: 12, unit_price: 45 },
        { min_quantity: 60, unit_price: 41.5 },
        { min_quantity: 240, unit_price: 38 },
      ],
    });

    assert.equal(pricing.minOrderQuantity, 12);
    assert.deepEqual(pricing.tiers, [
      { minQuantity: 12, unitPrice: 45 },
      { minQuantity: 60, unitPrice: 41.5 },
      { minQuantity: 240, unitPrice: 38 },
    ]);
  });

  it('reads the quantity→price object form', () => {
    assert.deepEqual(resolvePricing(45, { tiers: { '12': 45, '60': 41.5, '240': 38 } }).tiers, [
      { minQuantity: 12, unitPrice: 45 },
      { minQuantity: 60, unitPrice: 41.5 },
      { minQuantity: 240, unitPrice: 38 },
    ]);
  });

  it('accepts camelCase and aliased key spellings', () => {
    assert.deepEqual(resolvePricing(45, { minOrderQuantity: 6, bulkPricing: [{ from: 6, price: 40 }] }), {
      unitPrice: 40,
      minOrderQuantity: 6,
      tiers: [{ minQuantity: 6, unitPrice: 40 }],
      compareAtPrice: null,
    });
  });

  it('infers the minimum from the lowest tier when none is declared', () => {
    // A "12+ → 45 MAD" ladder with no stated minimum means 12 IS the minimum;
    // inventing a tier at quantity 1 would sell below the published ladder.
    assert.equal(resolvePricing(45, { tiers: { '12': 45, '60': 41.5 } }).minOrderQuantity, 12);
  });

  it('covers the declared minimum when the tiers start above it', () => {
    assert.deepEqual(resolvePricing(50, { moq: 5, price_tiers: [{ min_qty: 20, price: 44 }] }).tiers, [
      { minQuantity: 5, unitPrice: 44 },
      { minQuantity: 20, unitPrice: 44 },
    ]);
  });

  it('sorts tiers and keeps the cheaper of a duplicated break', () => {
    const pricing = resolvePricing(50, {
      moq: 10,
      tiers: [
        { min_quantity: 100, unit_price: 30 },
        { min_quantity: 10, unit_price: 45 },
        { min_quantity: 10, unit_price: 44 },
      ],
    });
    assert.deepEqual(pricing.tiers, [
      { minQuantity: 10, unitPrice: 44 },
      { minQuantity: 100, unitPrice: 30 },
    ]);
  });

  it('discards malformed tiers instead of throwing', () => {
    assert.deepEqual(resolvePricing(45, { price_tiers: ['nonsense', { nope: 1 }, null] }).tiers, [
      { minQuantity: 1, unitPrice: 45 },
    ]);
  });

  it('only treats a compare-at price as a discount when it is higher', () => {
    assert.equal(resolvePricing(45, { retail_price: 60 }).compareAtPrice, 60);
    assert.equal(resolvePricing(45, { retail_price: 30 }).compareAtPrice, null);
  });

  it('degrades a null price to zero rather than NaN', () => {
    assert.equal(resolvePricing(null, null).unitPrice, 0);
  });

  it('pulls a number out of a stringly-typed quantity', () => {
    assert.equal(resolvePricing(45, { min_order_quantity: '12 pcs' }).minOrderQuantity, 12);
  });
});

describe('unitPriceFor', () => {
  const model = resolvePricing(45, {
    min_order_quantity: 12,
    price_tiers: [
      { min_quantity: 12, unit_price: 45 },
      { min_quantity: 60, unit_price: 41.5 },
      { min_quantity: 240, unit_price: 38 },
    ],
  });

  it('picks the highest tier the quantity reaches', () => {
    assert.equal(unitPriceFor(model, 12).unitPrice, 45);
    assert.equal(unitPriceFor(model, 59).unitPrice, 45);
    assert.equal(unitPriceFor(model, 60).unitPrice, 41.5);
    assert.equal(unitPriceFor(model, 1000).unitPrice, 38);
  });

  it('surfaces the next break so the app can nudge the buyer', () => {
    assert.deepEqual(unitPriceFor(model, 60).nextTier, { minQuantity: 240, unitPrice: 38 });
    assert.equal(unitPriceFor(model, 1000).nextTier, null);
  });

  it('prices below the minimum at the first tier', () => {
    // The order endpoint rejects sub-minimum quantities; pricing must still
    // return something sane so the UI can show why.
    assert.equal(unitPriceFor(model, 1).unitPrice, 45);
  });
});
