import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> backend/api
const packageRoot = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(packageRoot, '.env'), quiet: true });

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Interface to bind. 0.0.0.0 by default so a phone on the same Wi-Fi can
  // reach the dev server; behind a reverse proxy set 127.0.0.1 so the API has
  // no public socket of its own even if the firewall is misconfigured.
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('').transform(csv),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy .env.example to .env and fill it in'),
  DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
  DATABASE_CA_CERT_PATH: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  PAYMENT_PROVIDER: z.enum(['cmi', 'stripe']).default('cmi'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),

  CMI_CLIENT_ID: z.string().default(''),
  CMI_STORE_KEY: z.string().default(''),
  CMI_STORE_NAME: z.string().default(''),
  CMI_GATEWAY_URL: z.string().default('https://testpayment.cmi.co.ma/fim/est3Dgate'),
  CMI_CURRENCY_CODE: z.string().default('504'),
  CMI_LANG: z.enum(['ar', 'fr', 'en']).default('ar'),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // products.status values that must never reach the apps. Anything not listed
  // here (including NULL) is treated as live, so a new status coming out of the
  // ingestion pipeline never silently empties the catalogue.
  PRODUCT_HIDDEN_STATUSES: z
    .string()
    .default('draft,archived,deleted,disabled,hidden,rejected')
    .transform(csv),

  CHECKOUT_RETURN_SCHEME: z.string().default('qri3aespress'),
  SHIPPING_FLAT_RATE_MAD: z.coerce.number().min(0).default(0),
  MIN_ORDER_TOTAL_MAD: z.coerce.number().min(0).default(0),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail fast and loudly: a half-configured API that boots is worse than one
  // that refuses to.
  throw new Error(`Invalid environment configuration:\n${details}\n`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';

/**
 * `ssl` option for `pg.Pool`. `require` encrypts without validating the chain,
 * which is what most managed Postgres instances with a self-signed cert need;
 * `verify-full` additionally pins the CA you point at.
 */
export function databaseSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  switch (env.DATABASE_SSL) {
    case 'disable':
      return false;
    case 'require':
      return { rejectUnauthorized: false };
    case 'verify-full': {
      if (!env.DATABASE_CA_CERT_PATH) {
        throw new Error('DATABASE_SSL=verify-full requires DATABASE_CA_CERT_PATH');
      }
      return {
        rejectUnauthorized: true,
        ca: readFileSync(env.DATABASE_CA_CERT_PATH, 'utf8'),
      };
    }
  }
}

/** True when the configured gateway has everything it needs to take a payment. */
export function isPaymentProviderConfigured(): boolean {
  return env.PAYMENT_PROVIDER === 'stripe'
    ? Boolean(env.STRIPE_SECRET_KEY)
    : Boolean(env.CMI_CLIENT_ID && env.CMI_STORE_KEY);
}

export interface ConfigReview {
  /** Security hazards. The server refuses to start in production with any of these. */
  fatal: string[];
  /** Real gaps that do not make the deployment unsafe — logged loudly instead. */
  warnings: string[];
}

/**
 * Splits production configuration problems by whether they can hurt someone.
 *
 * An unconfigured payment gateway is deliberately NOT fatal: the catalogue,
 * accounts, cart and order history all work without one, and `/payments/checkout`
 * already answers 503 with a plain explanation. Refusing to boot would mean a
 * merchant cannot run the API at all while their CMI contract is still being
 * signed — which is the normal state for weeks.
 *
 * A placeholder signing secret or a plain-http callback URL is different: those
 * are exploitable, so they stop the process.
 */
export function reviewProductionConfig(): ConfigReview {
  const review: ConfigReview = { fatal: [], warnings: [] };
  if (!isProduction) return review;

  if (env.JWT_SECRET.includes('change-me')) {
    review.fatal.push(
      'JWT_SECRET still holds the placeholder from .env.example — anyone can forge a session. Generate one with: openssl rand -base64 48',
    );
  }
  if (!env.PUBLIC_API_URL.startsWith('https://')) {
    review.fatal.push(
      'PUBLIC_API_URL must be https in production — it is the address payment gateways post results back to',
    );
  }

  if (!isPaymentProviderConfigured()) {
    review.warnings.push(
      env.PAYMENT_PROVIDER === 'stripe'
        ? 'STRIPE_SECRET_KEY is empty — checkout will answer 503 until it is set'
        : 'CMI_CLIENT_ID / CMI_STORE_KEY are empty — checkout will answer 503 until they are set',
    );
  } else if (env.PAYMENT_PROVIDER === 'cmi' && env.CMI_GATEWAY_URL.includes('testpayment')) {
    review.warnings.push(
      'CMI_GATEWAY_URL points at the test gateway — real cards will not be charged',
    );
  }

  return review;
}
