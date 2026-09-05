-- =============================================================================
-- REFERENCE ONLY — this file is NOT run by `npm run db:migrate`.
--
-- public.products already exists on the VPS and is owned by the ingestion
-- pipeline. This file documents the shape the API reads from, and lets you
-- stand up an empty local database with the same structure for development.
--
-- Run manually if (and only if) you need a local copy:
--     psql "$DATABASE_URL" -f db/reference/products.reference.sql
--
-- It creates NO rows. The apps read real products from the real database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id                    BIGSERIAL PRIMARY KEY,
  edited_images         TEXT[],
  generated_title       TEXT,
  generated_description TEXT,
  price                 NUMERIC(12,2),
  category              TEXT CHECK (category IN ('wholesale', 'dropshipping')),
  extra_info            JSONB,
  status                TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
