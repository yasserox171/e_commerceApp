import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import { round2 } from '../../lib/money.js';
import type {
  CallbackContext,
  CallbackResult,
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
} from './provider.js';

/**
 * Optional fallback gateway, used when PAYMENT_PROVIDER=stripe.
 *
 * `stripe` is an optionalDependency and is imported lazily, so an install that
 * skipped it still boots — the provider simply reports itself unconfigured.
 * The SDK is typed structurally here rather than through `import type` for the
 * same reason: the API must typecheck whether or not the package is present.
 */

interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

interface StripeEventObject {
  id?: string;
  client_reference_id?: string | null;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  status?: string | null;
  last_payment_error?: { message?: string } | null;
}

interface StripeEvent {
  type: string;
  data: { object: StripeEventObject };
}

interface StripeLike {
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<StripeCheckoutSession>;
    };
  };
  webhooks: {
    constructEvent(payload: Buffer | string, signature: string, secret: string): StripeEvent;
  };
}

type StripeConstructor = new (key: string, config?: Record<string, unknown>) => StripeLike;

// Stripe charges in the currency's smallest unit; MAD has two decimals.
const MINOR_UNITS = 100;

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly displayName = 'Stripe — Card';

  #client: StripeLike | null = null;

  isConfigured(): boolean {
    return Boolean(env.STRIPE_SECRET_KEY);
  }

  async #stripe(): Promise<StripeLike> {
    if (this.#client) return this.#client;
    if (!this.isConfigured()) {
      throw ApiError.serviceUnavailable('Stripe is not configured — set STRIPE_SECRET_KEY');
    }

    let module: { default: StripeConstructor };
    try {
      module = (await import('stripe')) as unknown as { default: StripeConstructor };
    } catch {
      throw ApiError.serviceUnavailable(
        'The `stripe` package is not installed. Run `npm install stripe -w @ecommerce/api` or set PAYMENT_PROVIDER=cmi.',
      );
    }

    this.#client = new module.default(env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' });
    return this.#client;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const stripe = await this.#stripe();
    const base = env.PUBLIC_API_URL.replace(/\/+$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Card only. No `customer_balance`, no invoice, nothing that could settle
      // after delivery.
      payment_method_types: ['card'],
      client_reference_id: request.reference,
      customer_email: request.customer.email,
      locale: request.locale === 'ar' ? 'auto' : request.locale,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: Math.round(round2(request.amount) * MINOR_UNITS),
            product_data: { name: `طلب ${request.reference}` },
          },
        },
      ],
      metadata: { orderId: request.orderId, reference: request.reference },
      success_url: `${base}/payments/stripe/return?reference=${encodeURIComponent(request.reference)}&status=success`,
      cancel_url: `${base}/payments/stripe/return?reference=${encodeURIComponent(request.reference)}&status=cancelled`,
    });

    if (!session.url) {
      throw ApiError.payment('Stripe did not return a checkout URL');
    }

    return {
      provider: this.id,
      providerRef: session.id,
      instruction: { kind: 'redirect', url: session.url },
    };
  }

  async verifyCallback(context: CallbackContext): Promise<CallbackResult> {
    const stripe = await this.#stripe();

    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw ApiError.serviceUnavailable('STRIPE_WEBHOOK_SECRET is required to verify webhooks');
    }
    const signature = context.headers['stripe-signature'];
    if (!signature) {
      throw ApiError.badRequest('Missing Stripe-Signature header');
    }
    if (!context.rawBody) {
      throw ApiError.internal('Stripe webhooks need the raw request body — check the express.raw() mount');
    }

    let event: StripeEvent;
    try {
      event = stripe.webhooks.constructEvent(context.rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      throw ApiError.forbidden(`Invalid Stripe signature: ${(error as Error).message}`);
    }

    const object = event.data.object;
    const reference = object.client_reference_id ?? '';
    if (!reference) {
      throw ApiError.badRequest('Stripe event carries no client_reference_id');
    }

    const paid =
      event.type === 'checkout.session.completed' && object.payment_status === 'paid';
    const cancelled = event.type === 'checkout.session.expired';

    return {
      reference,
      providerRef: (typeof object.payment_intent === 'string' ? object.payment_intent : null) ?? object.id ?? null,
      status: paid ? 'paid' : cancelled ? 'cancelled' : 'failed',
      rawStatus: `${event.type} (payment_status=${object.payment_status ?? 'n/a'})`,
      amount: typeof object.amount_total === 'number' ? round2(object.amount_total / MINOR_UNITS) : null,
      failureReason: paid ? null : (object.last_payment_error?.message ?? event.type),
      raw: { type: event.type, object: object as unknown as Record<string, unknown> },
    };
  }
}
