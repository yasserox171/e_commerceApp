-- =============================================================================
-- 0001_commerce_schema.sql
-- Creates everything the two apps need on top of the EXISTING public.products
-- table, inside a dedicated `commerce` schema so nothing in `public` collides.
--
-- Design notes
--   * public.products is NEVER modified here. It is read-only for the apps.
--   * Money is NUMERIC(12,2) in MAD, matching products.price.
--   * There is deliberately NO 'cod' value in commerce.payment_method: cash on
--     delivery is impossible at the database level, not just in the API.
--   * Dropshipping orders are additionally constrained to card payments only.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS commerce;

-- gen_random_uuid() lives in pgcrypto on PG < 13 and in core on PG >= 13.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pgcrypto not installed (insufficient privilege); assuming PG >= 13 built-in gen_random_uuid()';
END
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'channel' AND n.nspname = 'commerce') THEN
    CREATE TYPE commerce.channel AS ENUM ('wholesale', 'dropshipping');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'order_status' AND n.nspname = 'commerce') THEN
    CREATE TYPE commerce.order_status AS ENUM (
      'pending_payment',   -- created, waiting for the customer to pay
      'awaiting_approval', -- wholesale only: sales rep has to confirm the quote
      'processing',        -- paid / approved, being prepared
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'payment_status' AND n.nspname = 'commerce') THEN
    CREATE TYPE commerce.payment_status AS ENUM (
      'initiated', 'authorized', 'paid', 'failed', 'cancelled', 'refunded'
    );
  END IF;

  -- No 'cod' member: cash on delivery cannot be represented at all.
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'payment_method' AND n.nspname = 'commerce') THEN
    CREATE TYPE commerce.payment_method AS ENUM ('card', 'bank_transfer');
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION commerce.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  full_name      TEXT,
  -- which app the account was opened from; a wholesale buyer is a reseller,
  -- a retail buyer is the end consumer.
  account_type   commerce.channel NOT NULL,
  business_name  TEXT,
  ice_number     TEXT,             -- Moroccan company identifier (wholesale)
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_account_type_key
  ON commerce.users (lower(email), account_type);

DROP TRIGGER IF EXISTS users_touch_updated_at ON commerce.users;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON commerce.users
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- -----------------------------------------------------------------------------
-- addresses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES commerce.users(id) ON DELETE CASCADE,
  label        TEXT,
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  region       TEXT,
  postal_code  TEXT,
  country_code TEXT NOT NULL DEFAULT 'MA',
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON commerce.addresses (user_id);

DROP TRIGGER IF EXISTS addresses_touch_updated_at ON commerce.addresses;
CREATE TRIGGER addresses_touch_updated_at
  BEFORE UPDATE ON commerce.addresses
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- -----------------------------------------------------------------------------
-- carts  (one open cart per user per channel)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES commerce.users(id) ON DELETE CASCADE,
  channel    commerce.channel NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS carts_user_channel_key
  ON commerce.carts (user_id, channel);

DROP TRIGGER IF EXISTS carts_touch_updated_at ON commerce.carts;
CREATE TRIGGER carts_touch_updated_at
  BEFORE UPDATE ON commerce.carts
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- public.products is owned by the ingestion pipeline and its `id` may be
-- bigint, integer or uuid depending on how it was provisioned. Mirror whatever
-- type is actually there so joins stay index-friendly and no cast is needed.
CREATE OR REPLACE FUNCTION commerce.product_id_sql_type()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT CASE
              WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
              ELSE c.data_type
            END
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name  = 'products'
        AND c.column_name = 'id'),
    'bigint'
  );
$$;

DO $$
BEGIN
  EXECUTE format($fmt$
    CREATE TABLE IF NOT EXISTS commerce.cart_items (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cart_id    UUID NOT NULL REFERENCES commerce.carts(id) ON DELETE CASCADE,
      -- Soft reference to public.products. Intentionally NOT a foreign key: the
      -- catalogue is owned by a separate ingestion pipeline and rows may be
      -- archived or replaced without us blocking that pipeline.
      product_id %s NOT NULL,
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $fmt$, commerce.product_id_sql_type());
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_key
  ON commerce.cart_items (cart_id, product_id);

DROP TRIGGER IF EXISTS cart_items_touch_updated_at ON commerce.cart_items;
CREATE TRIGGER cart_items_touch_updated_at
  BEFORE UPDATE ON commerce.cart_items
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short human-readable reference shown in the app and sent to the gateway.
  reference         TEXT NOT NULL UNIQUE,
  user_id           UUID NOT NULL REFERENCES commerce.users(id) ON DELETE RESTRICT,
  channel           commerce.channel NOT NULL,
  status            commerce.order_status NOT NULL DEFAULT 'pending_payment',
  payment_method    commerce.payment_method NOT NULL DEFAULT 'card',

  currency          TEXT NOT NULL DEFAULT 'MAD',
  subtotal          NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  shipping_total    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  discount_total    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total             NUMERIC(12,2) NOT NULL CHECK (total >= 0),

  -- Shipping address is snapshotted so an edit to the address book never
  -- rewrites the history of an order that already shipped.
  shipping_address  JSONB,
  customer_note     TEXT,
  tracking_carrier  TEXT,
  tracking_number   TEXT,
  placed_at         TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prepaid card only on the consumer app. Cash on delivery is not merely
  -- disabled in the UI — it cannot be stored.
  CONSTRAINT orders_dropshipping_is_prepaid_card
    CHECK (channel <> 'dropshipping' OR payment_method = 'card')
);

CREATE INDEX IF NOT EXISTS orders_user_created_idx
  ON commerce.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_channel_status_idx
  ON commerce.orders (channel, status);

DROP TRIGGER IF EXISTS orders_touch_updated_at ON commerce.orders;
CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- -----------------------------------------------------------------------------
-- order_items  (price + title snapshotted at purchase time)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format($fmt$
    CREATE TABLE IF NOT EXISTS commerce.order_items (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id      UUID NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
      product_id    %s NOT NULL,
      title         TEXT NOT NULL,
      image_url     TEXT,
      unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      quantity      INTEGER NOT NULL CHECK (quantity > 0),
      line_total    NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
      -- Which wholesale tier produced unit_price, for auditing.
      pricing_tier  JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $fmt$, commerce.product_id_sql_type());
END
$$;

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON commerce.order_items (order_id);

-- -----------------------------------------------------------------------------
-- payments  (one row per attempt against a gateway)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,              -- 'cmi' | 'stripe' | ...
  provider_ref    TEXT,                       -- gateway transaction id
  status          commerce.payment_status NOT NULL DEFAULT 'initiated',
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'MAD',
  -- Full gateway callback payload, for reconciliation and dispute handling.
  -- Never contains a PAN: the card is entered on the gateway's own page.
  raw_response    JSONB,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON commerce.payments (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_key
  ON commerce.payments (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

DROP TRIGGER IF EXISTS payments_touch_updated_at ON commerce.payments;
CREATE TRIGGER payments_touch_updated_at
  BEFORE UPDATE ON commerce.payments
  FOR EACH ROW EXECUTE FUNCTION commerce.touch_updated_at();

-- -----------------------------------------------------------------------------
-- order_events  (append-only status timeline shown in the tracking screen)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commerce.order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  status      commerce.order_status NOT NULL,
  note        TEXT,
  created_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_created_idx
  ON commerce.order_events (order_id, created_at);
