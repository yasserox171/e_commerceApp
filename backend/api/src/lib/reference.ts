import { randomBytes } from 'node:crypto';

// Crockford-style alphabet: no I, L, O, U — a customer reading a reference over
// the phone can't confuse it with 1 or 0.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return token;
}

/**
 * Human-readable order reference, e.g. `WS-9K3M2P` or `DS-4TQX7B`.
 * Short enough to read out loud, and it doubles as the merchant order id we
 * hand to CMI.
 */
export function generateOrderReference(channel: 'wholesale' | 'dropshipping'): string {
  const prefix = channel === 'wholesale' ? 'WS' : 'DS';
  return `${prefix}-${randomToken(6)}`;
}
