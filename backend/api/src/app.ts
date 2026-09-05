import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env, isProduction } from './config/env.js';
import { checkDatabase } from './db/pool.js';
import { authRouter } from './domain/auth/auth.routes.js';
import { cartRouter } from './domain/cart/cart.routes.js';
import { ordersRouter } from './domain/orders/orders.routes.js';
import { paymentsRouter } from './domain/payments/payments.routes.js';
import { productsRouter } from './domain/products/products.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

/** Stripe verifies its signature against the exact bytes it sent. */
const RAW_BODY_PATHS = new Set(['/payments/stripe/webhook']);

export function createApp(): Express {
  const app = express();

  // Behind nginx/Caddy on the VPS: needed for correct client IPs in the rate
  // limiter and for `req.protocol` in generated URLs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The only HTML this API serves is the payment return page, which carries
      // its own inline styles and no third-party resources.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
      credentials: false,
    }),
  );

  app.use(compression());
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.use((req, res, next) => {
    if (RAW_BODY_PATHS.has(req.path)) {
      next();
      return;
    }
    express.json({ limit: '1mb' })(req, res, next);
  });

  app.get('/health', async (_req, res) => {
    const database = await checkDatabase();
    res.status(database.ok ? 200 : 503).json({
      status: database.ok ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      database,
      paymentProvider: env.PAYMENT_PROVIDER,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: '9ri3a commerce API',
      version: 1,
      docs: 'See backend/api/README.md',
      endpoints: ['/health', '/auth', '/products', '/cart', '/orders', '/payments'],
    });
  });

  app.use('/auth', authRouter);
  app.use('/products', productsRouter);
  app.use('/cart', cartRouter);
  app.use('/orders', ordersRouter);
  app.use('/payments', paymentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
