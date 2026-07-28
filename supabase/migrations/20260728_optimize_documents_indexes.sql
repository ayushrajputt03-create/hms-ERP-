-- ============================================================================
-- HMS ERP — performance indexes for public.documents
-- ----------------------------------------------------------------------------
-- Additive and safe: only creates indexes, no data or schema changes.
-- Targets the exact access patterns in src/lib/db.js:
--   * subscribeToCollection / queryDocuments  -> WHERE collection = $1
--   * RLS is_facility_member                  -> WHERE facility_id = $1
--   * deleteDocument subtree                  -> WHERE path LIKE '$1/%'
--   * queryDocuments filtered                 -> WHERE data->>field = $1
--
-- How to apply:
--   supabase db push
--   -- or paste into the Supabase SQL editor.
--
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction. The
-- migration runner wraps statements in a transaction, so we use plain
-- CREATE INDEX IF NOT EXISTS here. On a large live table, prefer running the
-- CONCURRENTLY variants (commented at the bottom) manually, outside a txn.
-- ============================================================================

-- Hot path: every collection subscription and query filters by `collection`.
CREATE INDEX IF NOT EXISTS documents_collection_idx
  ON public.documents (collection);

-- RLS (is_facility_member) and cross-tenant scoping filter by `facility_id`.
CREATE INDEX IF NOT EXISTS documents_facility_id_idx
  ON public.documents (facility_id);

-- Combined RLS + collection filter (covers the common subscribe-under-tenant case).
CREATE INDEX IF NOT EXISTS documents_facility_collection_idx
  ON public.documents (facility_id, collection);

-- Subtree deletes use `path LIKE 'prefix/%'`. The primary-key btree on `path`
-- uses the default opclass, which a left-anchored LIKE cannot use. text_pattern_ops
-- enables index usage for the prefix scan.
CREATE INDEX IF NOT EXISTS documents_path_pattern_idx
  ON public.documents (path text_pattern_ops);

-- General JSONB acceleration for containment / key lookups in queryDocuments.
CREATE INDEX IF NOT EXISTS documents_data_gin_idx
  ON public.documents USING gin (data jsonb_path_ops);

-- Keep planner statistics fresh after creating indexes.
ANALYZE public.documents;

-- ----------------------------------------------------------------------------
-- Zero-downtime variant for a large PRODUCTION table (run manually, NOT in a txn):
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_collection_idx
--     ON public.documents (collection);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_facility_id_idx
--     ON public.documents (facility_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_facility_collection_idx
--     ON public.documents (facility_id, collection);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_path_pattern_idx
--     ON public.documents (path text_pattern_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_data_gin_idx
--     ON public.documents USING gin (data jsonb_path_ops);
-- ----------------------------------------------------------------------------
