import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeCmiHash } from './cmi.provider.js';

/**
 * The hash is the whole of CMI's integrity guarantee: it authenticates the
 * amount we send and the outcome CMI sends back. `referenceHash` below is an
 * independent transcription of the algorithm from CMI's own PHP sample, so a
 * mistake in the implementation cannot be mirrored by a mistake in the test.
 */
function referenceHash(params: Record<string, string>, storeKey: string): string {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const keys = Object.keys(params)
    .filter((key) => !['hash', 'encoding'].includes(key.toLowerCase()))
    .sort((a, b) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });

  let plain = '';
  for (const key of keys) plain += `${escape(params[key] ?? '')}|`;
  plain += escape(storeKey);

  return createHash('sha512').update(plain, 'utf8').digest('base64');
}

const SAMPLE: Record<string, string> = {
  clientid: '600000000',
  storetype: '3D_PAY_HOSTING',
  trantype: 'Auth',
  amount: '450.00',
  currency: '504',
  oid: 'DS-9K3M2P',
  okUrl: 'https://api.example.com/payments/cmi/return',
  failUrl: 'https://api.example.com/payments/cmi/return',
  lang: 'ar',
  rnd: 'a1b2c3d4e5f6',
  encoding: 'UTF-8',
  BillToName: 'Yassir A',
  email: 'buyer@example.com',
};

const STORE_KEY = 'S3cr3t|Key\\With Specials';

describe('computeCmiHash', () => {
  it('matches an independent implementation of the NestPay v3 algorithm', () => {
    assert.equal(computeCmiHash(SAMPLE, STORE_KEY), referenceHash(SAMPLE, STORE_KEY));
  });

  it('produces base64 of a SHA-512 digest', () => {
    assert.equal(Buffer.from(computeCmiHash(SAMPLE, STORE_KEY), 'base64').length, 64);
  });

  it('excludes hash and encoding from the digest', () => {
    assert.equal(
      computeCmiHash({ ...SAMPLE, hash: 'whatever-was-there' }, STORE_KEY),
      computeCmiHash(SAMPLE, STORE_KEY),
    );
  });

  it('is independent of key insertion order', () => {
    const reversed = Object.fromEntries(Object.entries(SAMPLE).reverse());
    assert.equal(computeCmiHash(reversed, STORE_KEY), computeCmiHash(SAMPLE, STORE_KEY));
  });

  it('changes when the amount changes', () => {
    // This is what stops a tampered callback from settling an order cheaply.
    assert.notEqual(computeCmiHash({ ...SAMPLE, amount: '1.00' }, STORE_KEY), computeCmiHash(SAMPLE, STORE_KEY));
  });

  it('changes when the store key changes', () => {
    assert.notEqual(computeCmiHash(SAMPLE, STORE_KEY), computeCmiHash(SAMPLE, `${STORE_KEY}x`));
  });

  it('escapes pipes so a value cannot fake a field boundary', () => {
    assert.notEqual(computeCmiHash({ x: 'a|b', y: 'c' }, 'k'), computeCmiHash({ x: 'a', y: 'b|c' }, 'k'));
  });

  it('escapes backslashes', () => {
    assert.notEqual(computeCmiHash({ x: 'a\\', y: 'b' }, 'k'), computeCmiHash({ x: 'a', y: '\\b' }, 'k'));
  });
});
