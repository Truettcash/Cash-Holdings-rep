-- ============================================================================
-- CASH HOLDINGS — OPEN KNOWLEDGE: SEARCH + RETRIEVAL INDEXES
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Part 4 of 4 (R4A.1 Open Knowledge foundation).
-- Adds only the additional performance indexes justified by the two planned
-- retrieval lanes (lexical full-text today; semantic/embedding-based later).
-- Does not add a vector similarity index yet — embeddings are optional
-- infrastructure per R4A.1 and no ivfflat/hnsw index should be built before
-- there is representative embedded data to tune it against.
-- ============================================================================

begin;

-- Lexical retrieval lane: GIN index over the generated tsvector column.
create index if not exists knowledge_content_search_vector_idx
  on public.knowledge_content using gin (search_vector);

-- Current-document retrieval is the common path for knowledge.get_context;
-- a partial index keeps that lookup cheap without indexing superseded rows.
create index if not exists knowledge_documents_source_id_current_idx
  on public.knowledge_documents (source_id)
  where is_current;

commit;
