import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import { CmiPaymentProvider } from './cmi.provider.js';
import { StripePaymentProvider } from './stripe.provider.js';
import type { PaymentProvider } from './provider.js';

/**
 * Adding a gateway is: implement `PaymentProvider`, register it here, add its
 * id to the `PAYMENT_PROVIDER` enum in config/env.ts. Nothing in the order
 * flow, the apps, or the database schema changes.
 */
const providers = new Map<string, PaymentProvider>([
  ['cmi', new CmiPaymentProvider()],
  ['stripe', new StripePaymentProvider()],
]);

/** The gateway the dropshipping checkout uses, per PAYMENT_PROVIDER. */
export function activeProvider(): PaymentProvider {
  const provider = providers.get(env.PAYMENT_PROVIDER);
  if (!provider) {
    throw ApiError.internal(`Unknown PAYMENT_PROVIDER "${env.PAYMENT_PROVIDER}"`);
  }
  return provider;
}

/** Looked up by id when handling a callback, which may arrive for either. */
export function providerById(id: string): PaymentProvider {
  const provider = providers.get(id);
  if (!provider) throw ApiError.notFound(`Unknown payment provider "${id}"`);
  return provider;
}

export function describeProviders() {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    configured: provider.isConfigured(),
    active: provider.id === env.PAYMENT_PROVIDER,
  }));
}
