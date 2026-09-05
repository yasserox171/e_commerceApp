-- =============================================================================
-- 0002_products_search_indexes.sql
-- Read-path indexes on the EXISTING public.products table.
--
-- This migration only ever ADDS indexes — no column, constraint or row in
-- public.products is touched. Every statement is guarded so that running it
-- against a database where the API role cannot index public.products degrades
-- to a NOTICE instead of failing the whole migration run.
-- =============================================================================

DO $$
DECLARE
  has_products BOOLEAN;
  has_trgm     BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'products'
  ) INTO has_products;

  IF NOT has_products THEN
    RAISE NOTICE 'public.products not found — skipping product index creation.';
    RETURN;
  END IF;

  -- Main catalogue query: filter by channel + status, newest first.
  BEGIN
    CREATE INDEX IF NOT EXISTS products_category_status_created_idx
      ON public.products (category, status, created_at DESC);
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
    RAISE NOTICE 'skipped products_category_status_created_idx: %', SQLERRM;
  END;

  -- Price range filter / price sort within a channel.
  BEGIN
    CREATE INDEX IF NOT EXISTS products_category_price_idx
      ON public.products (category, price);
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
    RAISE NOTICE 'skipped products_category_price_idx: %', SQLERRM;
  END;

  -- Containment lookups into extra_info (supplier, brand, tags, tiers).
  BEGIN
    CREATE INDEX IF NOT EXISTS products_extra_info_gin_idx
      ON public.products USING GIN (extra_info jsonb_path_ops);
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
    RAISE NOTICE 'skipped products_extra_info_gin_idx: %', SQLERRM;
  END;

  -- Free-text search. pg_trgm turns the app's ILIKE '%…%' query into an index
  -- scan; without it the search still works, just with a sequential scan.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    has_trgm := TRUE;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm unavailable — text search will fall back to a sequential scan.';
  END;

  IF has_trgm THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS products_title_trgm_idx
        ON public.products USING GIN (generated_title gin_trgm_ops);
    EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
      RAISE NOTICE 'skipped products_title_trgm_idx: %', SQLERRM;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS products_description_trgm_idx
        ON public.products USING GIN (generated_description gin_trgm_ops);
    EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
      RAISE NOTICE 'skipped products_description_trgm_idx: %', SQLERRM;
    END;
  END IF;
END
$$;
