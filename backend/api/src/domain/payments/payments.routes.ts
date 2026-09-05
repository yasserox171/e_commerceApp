import express, { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { asyncHandler } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { applySettlement, getOrder, toCheckoutAddress } from '../orders/orders.service.js';
import { activeProvider, describeProviders, providerById } from './registry.js';

export const paymentsRouter: Router = Router();

/** CMI posts its results as application/x-www-form-urlencoded. */
const formBody = express.urlencoded({ extended: false });

/**
 * Typed structurally rather than as `Request` so it accepts the narrowed
 * request types `asyncHandler` produces as well as a plain Express request.
 */
function headerRecord(req: {
  headers: Record<string, string | string[] | undefined>;
}): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return headers;
}

/**
 * GET /payments/methods
 * Lets the app show the right payment label without hardcoding the gateway,
 * and state plainly that cash on delivery is not offered.
 */
paymentsRouter.get('/methods', (_req, res) => {
  res.json({
    active: env.PAYMENT_PROVIDER,
    prepaidCardOnly: true,
    cashOnDelivery: false,
    providers: describeProviders(),
  });
});

/**
 * POST /payments/checkout  { orderId }
 * Registers a payment attempt and returns the instruction the app needs to hand
 * control to the gateway. The card itself is entered on the gateway's page — no
 * card data reaches this API.
 */
paymentsRouter.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { orderId } = z.object({ orderId: z.string().uuid() }).parse(req.body);

    const order = await getOrder(user.id, orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.paymentMethod !== 'card') {
      throw ApiError.badRequest('This order is not settled by card');
    }
    if (order.status !== 'pending_payment') {
      throw ApiError.conflict(`Order ${order.reference} is not awaiting payment (status: ${order.status})`);
    }

    const provider = activeProvider();
    if (!provider.isConfigured()) {
      throw ApiError.serviceUnavailable(
        `Payment provider "${provider.id}" is not configured on the server`,
      );
    }

    const session = await provider.createCheckout({
      orderId: order.id,
      reference: order.reference,
      amount: order.total,
      currency: order.currency,
      customer: {
        email: req.user!.email,
        fullName: order.shippingAddress?.fullName ?? req.user!.fullName ?? 'Client',
        phone: order.shippingAddress?.phone ?? req.user!.phone,
      },
      shippingAddress: toCheckoutAddress(order.shippingAddress),
      locale: 'ar',
    });

    // Record the attempt before the shopper leaves, so a callback always has a
    // row to reconcile against.
    await query(
      `INSERT INTO commerce.payments (order_id, provider, provider_ref, status, amount, currency)
       VALUES ($1, $2, $3, 'initiated', $4, $5)
       ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL DO NOTHING`,
      [order.id, session.provider, session.providerRef, order.total, order.currency],
    );

    res.json({
      orderId: order.id,
      reference: order.reference,
      amount: order.total,
      currency: order.currency,
      provider: session.provider,
      instruction: session.instruction,
      /** The app closes its WebView as soon as it sees this prefix. */
      returnUrlPrefix: `${env.CHECKOUT_RETURN_SCHEME}://checkout-result`,
    });
  }),
);

/**
 * POST /payments/cmi/callback
 * Server-to-server notification. Authoritative: the shopper's browser may never
 * come back, but this always fires.
 */
paymentsRouter.post(
  '/cmi/callback',
  formBody,
  asyncHandler(async (req, res) => {
    const provider = providerById('cmi');
    const result = await provider.verifyCallback({
      body: req.body as Record<string, unknown>,
      headers: headerRecord(req),
    });
    const outcome = await applySettlement('cmi', result);

    // CMI expects the literal string ACTION=POSTAUTH to acknowledge receipt.
    res.type('text/plain').send('ACTION=POSTAUTH');
    console.log(`[payments] cmi callback ${outcome.reference} → ${outcome.status}`);
  }),
);

/**
 * POST|GET /payments/cmi/return
 * Where the shopper's browser lands. Renders a page that bounces straight back
 * into the app via its deep link; the WebView intercepts it and closes.
 */
paymentsRouter.all(
  '/cmi/return',
  formBody,
  asyncHandler(async (req, res) => {
    const payload = { ...(req.body as Record<string, unknown>), ...(req.query as Record<string, unknown>) };
    const reference = typeof payload.oid === 'string' ? payload.oid : '';

    let status: 'success' | 'failed' | 'cancelled' | 'unverified' = 'failed';
    try {
      const provider = providerById('cmi');
      const result = await provider.verifyCallback({ body: payload, headers: headerRecord(req) });
      const outcome = await applySettlement('cmi', result);
      status =
        outcome.status === 'processing' || result.status === 'paid'
          ? 'success'
          : result.status === 'cancelled'
            ? 'cancelled'
            : 'failed';
    } catch (error) {
      // The browser return is a convenience; the server-to-server callback is
      // what actually settles the order. Never show a stack trace here.
      console.error('[payments] cmi return could not be verified:', (error as Error).message);
      status = 'unverified';
    }

    res.status(200).type('html').send(renderReturnPage(reference, status));
  }),
);

/** POST /payments/stripe/webhook — needs the raw body for signature checking. */
paymentsRouter.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const provider = providerById('stripe');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw ApiError.badRequest('Stripe webhook body is not valid JSON');
    }

    const result = await provider.verifyCallback({
      body: parsed,
      rawBody,
      headers: headerRecord(req),
    });
    const outcome = await applySettlement('stripe', result);

    res.json({ received: true, reference: outcome.reference, status: outcome.status });
  }),
);

/** GET /payments/stripe/return — browser bounce back into the app. */
paymentsRouter.get('/stripe/return', (req, res) => {
  const parsed = z
    .object({
      reference: z.string().default(''),
      status: z.enum(['success', 'cancelled']).default('cancelled'),
    })
    .safeParse(req.query);

  const reference = parsed.success ? parsed.data.reference : '';
  const status = parsed.success ? parsed.data.status : 'failed';
  res.status(200).type('html').send(renderReturnPage(reference, status));
});

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const RETURN_COPY: Record<string, { title: string; body: string }> = {
  success: { title: 'تم الدفع بنجاح', body: 'جاري إرجاعك إلى التطبيق…' },
  cancelled: { title: 'تم إلغاء الدفع', body: 'لم يتم خصم أي مبلغ من بطاقتك.' },
  failed: { title: 'لم تنجح عملية الدفع', body: 'يمكنك المحاولة مرة أخرى ببطاقة أخرى.' },
  unverified: {
    title: 'جاري تأكيد الدفع',
    body: 'سنحدّث حالة طلبك تلقائياً بمجرد تأكيد البنك.',
  },
};

/**
 * Minimal self-contained page: no external assets (the gateway's browser may be
 * offline-hostile), redirects into the app immediately, and leaves a manual
 * link in case the automatic bounce is blocked.
 */
function renderReturnPage(reference: string, status: string): string {
  const copy = RETURN_COPY[status] ?? RETURN_COPY.failed!;
  const deepLink = `${env.CHECKOUT_RETURN_SCHEME}://checkout-result?reference=${encodeURIComponent(reference)}&status=${encodeURIComponent(status)}`;
  const accent = status === 'success' ? '#15803D' : status === 'unverified' ? '#B45309' : '#B91C1C';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF7F2;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1C1917;text-align:center;padding:24px}
  .card{max-width:360px}
  h1{font-size:20px;margin:0 0 8px;color:${accent}}
  p{margin:0 0 20px;color:#57534E;line-height:1.6}
  a{display:inline-block;background:#C2410C;color:#fff;text-decoration:none;
    padding:14px 28px;border-radius:14px;font-weight:600}
  code{background:#F5F0E8;padding:2px 8px;border-radius:6px;font-size:13px}
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    ${reference ? `<p>رقم الطلب: <code>${escapeHtml(reference)}</code></p>` : ''}
    <a href="${escapeHtml(deepLink)}">العودة إلى التطبيق</a>
  </div>
  <script>setTimeout(function(){location.replace(${JSON.stringify(deepLink)});},400);</script>
</body>
</html>`;
}
