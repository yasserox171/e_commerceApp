/**
 * All amounts in this API are MAD with two decimals, matching
 * NUMERIC(12,2) in Postgres. Arithmetic happens on JS numbers, so every value
 * that goes back to the database or to a payment gateway is rounded here first
 * — otherwise 3 × 41.5 lands as 124.50000000000001 and the gateway hash breaks.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

/** Fixed two-decimal string, the format CMI expects for the `amount` field. */
export function toAmountString(value: number): string {
  return round2(value).toFixed(2);
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
