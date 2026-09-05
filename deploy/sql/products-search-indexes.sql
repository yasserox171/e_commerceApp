-- =============================================================================
-- Optional: search indexes on the existing public.products table.
--
--   sudo -u postgres psql -d YOUR_DATABASE -f deploy/sql/products-search-indexes.sql
--
-- Migration 0002 tries to create these, but the API role only holds SELECT on
-- public.products — indexing a table requires owning it — so it logs a NOTICE
-- and moves on. Everything works without them; queries just fall back to
-- sequential scans, which stops being acceptable somewhere in the low
-- thousands of products.
--
-- Run this as the owner of public.products (usually `postgres`). Every
-- statement is IF NOT EXISTS, so re-running it is free.
--
-- CONCURRENTLY keeps the catalogue readable and writable while the indexes
-- build; the price is that each statement runs outside a transaction and a
-- failure can leave an INVALID index behind. If one does, drop it and re-run:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- =============================================================================

-- Trigram matching for the search box. Without it the ILIKE '%…%' the apps send
-- cannot use an index at all.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main catalogue query: filter by channel + status, newest first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_category_status_created_idx
  ON public.products (category, status, created_at DESC);

-- Price range filter and price sort within a channel.
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_category_price_idx
  ON public.products (category, price);

-- Containment lookups into extra_info (supplier, brand, tags, wholesale tiers).
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_extra_info_gin_idx
  ON public.products USING GIN (extra_info jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS products_title_trgm_idx
  ON public.products USING GIN (generated_title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS products_description_trgm_idx
  ON public.products USING GIN (generated_description gin_trgm_ops);

-- The planner needs statistics to choose them.
ANALYZE public.products;
