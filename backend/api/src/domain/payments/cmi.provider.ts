import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import { toAmountString } from '../../lib/money.js';
import type {
  CallbackContext,
  CallbackResult,
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  SettlementStatus,
} from './provider.js';

/**
 * CMI (Centre Monétique Interbancaire) runs on the NestPay/Payten platform.
 *
 * Flow (3D_PAY_HOSTING):
 *   1. We build a signed set of form fields and hand them to the app.
 *   2. The app POSTs them from a WebView to CMI's gateway, which renders the
 *      card form and runs 3-D Secure. No PAN ever touches this API.
 *   3. CMI POSTs the outcome to okUrl/failUrl (shopper's browser) and to
 *      callbackUrl (server to server). The callback is authoritative.
 *   4. Every response is re-hashed with the store key before it is trusted.
 */

const HASH_ALGORITHM = 'ver3';
const STORE_TYPE = '3D_PAY_HOSTING';
const TRANSACTION_TYPE = 'Auth'; // immediate sale, not a pre-authorisation

/**
 * NestPay v3 hashing.
 *
 * Values are escaped (`\` → `\\`, `|` → `\|`), joined with `|` in
 * case-insensitive natural key order, the escaped store key is appended, and
 * the SHA-512 digest is base64-encoded. `hash` and `encoding` are excluded.
 */
export function computeCmiHash(params: Record<string, string>, storeKey: string): string {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

  const keys = Object.keys(params)
    .filter((key) => {
      const lower = key.toLowerCase();
      return lower !== 'hash' && lower !== 'encoding';
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en', { numeric: true }));

  const plain = keys.map((key) => escape(params[key] ?? '')).join('|') + '|' + escape(storeKey);

  return createHash('sha512').update(plain, 'utf8').digest('base64');
}

/** Constant-time-ish comparison so a wrong hash leaks no timing information. */
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function stringifyParams(body: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    // CMI posts application/x-www-form-urlencoded, so everything arrives as a
    // string already; arrays only appear if a field is repeated.
    result[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value);
  }
  return result;
}

function classify(procReturnCode: string, response: string, mdStatus: string): SettlementStatus {
  const approved = procReturnCode === '00' && response.toLowerCase() === 'approved';
  if (approved) return 'paid';

  // mdStatus 0 with an empty response is what CMI sends when the shopper walks
  // away from the 3-D Secure step rather than failing it.
  if (!response && (mdStatus === '0' || mdStatus === '')) return 'cancelled';
  return 'failed';
}

export class CmiPaymentProvider implements PaymentProvider {
  readonly id = 'cmi';
  readonly displayName = 'CMI — بطاقة بنكية';

  isConfigured(): boolean {
    return Boolean(env.CMI_CLIENT_ID && env.CMI_STORE_KEY);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!this.isConfigured()) {
      throw ApiError.serviceUnavailable(
        'CMI is not configured — set CMI_CLIENT_ID and CMI_STORE_KEY in the API environment',
      );
    }

    const base = env.PUBLIC_API_URL.replace(/\/+$/, '');
    const fields: Record<string, string> = {
      clientid: env.CMI_CLIENT_ID,
      storetype: STORE_TYPE,
      trantype: TRANSACTION_TYPE,
      hashAlgorithm: HASH_ALGORITHM,
      amount: toAmountString(request.amount),
      currency: env.CMI_CURRENCY_CODE,
      oid: request.reference,
      okUrl: `${base}/payments/cmi/return`,
      failUrl: `${base}/payments/cmi/return`,
      callbackUrl: `${base}/payments/cmi/callback`,
      shopurl: `${base}/payments/cmi/return`,
      lang: request.locale === 'ar' ? 'ar' : request.locale,
      // `rnd` makes the signature unique per attempt; without it a replayed
      // form would carry a still-valid hash.
      rnd: randomBytes(12).toString('hex'),
      encoding: 'UTF-8',
      refreshtime: '3',
      BillToName: request.customer.fullName.slice(0, 60),
      email: request.customer.email,
    };

    if (env.CMI_STORE_NAME) fields.storename = env.CMI_STORE_NAME;
    if (request.customer.phone) fields.tel = request.customer.phone;

    if (request.shippingAddress) {
      fields.BillToStreet1 = request.shippingAddress.line1.slice(0, 64);
      fields.BillToCity = request.shippingAddress.city.slice(0, 40);
      fields.BillToCountry = request.shippingAddress.countryCode;
      if (request.shippingAddress.postalCode) {
        fields.BillToPostalCode = request.shippingAddress.postalCode;
      }
    }

    fields.hash = computeCmiHash(fields, env.CMI_STORE_KEY);

    return {
      provider: this.id,
      // CMI assigns its TransId at settlement, so there is nothing to record yet.
      providerRef: null,
      instruction: { kind: 'form_post', url: env.CMI_GATEWAY_URL, fields },
    };
  }

  async verifyCallback(context: CallbackContext): Promise<CallbackResult> {
    if (!this.isConfigured()) {
      throw ApiError.serviceUnavailable('CMI is not configured');
    }

    const params = stringifyParams(context.body);
    const received = params.HASH ?? params.hash ?? '';
    if (!received) {
      throw ApiError.badRequest('CMI callback is missing its HASH field');
    }

    const expected = computeCmiHash(params, env.CMI_STORE_KEY);
    if (!safeEquals(expected, received)) {
      // Refusing here is what stops a forged callback from marking an unpaid
      // order as paid.
      throw ApiError.forbidden('CMI callback signature is invalid');
    }

    const reference = params.oid ?? '';
    if (!reference) {
      throw ApiError.badRequest('CMI callback is missing the order id (oid)');
    }

    const procReturnCode = params.ProcReturnCode ?? '';
    const response = params.Response ?? '';
    const mdStatus = params.mdStatus ?? '';
    const status = classify(procReturnCode, response, mdStatus);

    const amount = params.amount ? Number.parseFloat(params.amount) : null;

    return {
      reference,
      providerRef: params.TransId ?? params.HostRefNum ?? null,
      status,
      rawStatus: `${response || 'unknown'} (ProcReturnCode=${procReturnCode || 'n/a'}, mdStatus=${mdStatus || 'n/a'})`,
      amount: amount !== null && Number.isFinite(amount) ? amount : null,
      failureReason:
        status === 'paid'
          ? null
          : params.ErrMsg || params.mdErrorMsg || params.ProcReturnCode || 'Payment was not approved',
      raw: params,
    };
  }
}
