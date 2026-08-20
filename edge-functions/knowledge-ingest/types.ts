/**
 * R4A.2 Open Knowledge ingestion — canonical type contracts.
 *
 * Every field here maps 1:1 onto the deployed schema from
 * supabase/migrations/20260815_00{1,2,3,4}_*.sql. No field here may drift
 * from those CHECK constraints without a migration.
 */

export type SourceType =
  | "manual_note"
  | "chatgpt_thread"
  | "document"
  | "crm"
  | "project"
  | "email"
  | "meeting"
  | "research_url"
  | "system_generated";

export type AuthorityLevel = "canonical" | "primary" | "supporting" | "unverified";

export type ContentType =
  | "text"
  | "markdown"
  | "pdf_extract"
  | "transcript"
  | "note"
  | "html"
  | "structured";

export type BrandScopeType = "global" | "brand" | "multi_brand";

/** Must match knowledge_entities_canonical_type_check exactly. */
export type CanonicalEntityTable =
  | "brands"
  | "organizations"
  | "contacts"
  | "projects"
  | "project_tasks"
  | "deals"
  | "integration_connections"
  | "metric_definitions"
  | "strategic_moves";

/** Must match knowledge_entities_entity_type_check exactly. */
export type EntityType =
  | "Brand"
  | "Person"
  | "Organization"
  | "Project"
  | "ProjectTask"
  | "Deal"
  | "Offer"
  | "System"
  | "Integration"
  | "Metric"
  | "Decision"
  | "Topic"
  | "Concept"
  | "ExternalEntity";

export type EntityRef =
  | { entity_type: EntityType; canonical_type: CanonicalEntityTable; canonical_id: string; display_name?: never }
  | { entity_type: EntityType; canonical_type?: never; canonical_id?: never; display_name: string };

export interface IngestionEnvelope {
  source: {
    type: SourceType;
    /** Set together with source_ref_id for UUID-backed Cash Holdings rows. */
    source_ref_type?: string;
    source_ref_id?: string;
    /** Stable adapter-provided identity for non-UUID external sources. */
    source_external_key?: string;
    title: string;
    origin_url?: string;
    authority_level: AuthorityLevel;
    source_created_at?: string;
    source_updated_at?: string;
  };
  document: {
    title: string;
    content_type: ContentType;
    /** 0 => global, 1 => brand, 2+ => multi_brand. Deduplicated by the core. */
    brand_ids: string[];
  };
  content: {
    text: string;
  };
  entity_refs?: EntityRef[];
}

/**
 * DUPLICATE INGESTION (the same envelope sent twice in immediate succession)
 * and UNCHANGED SOURCE (a later resync producing identical content) are
 * indistinguishable from the ingestion core's point of view — both are
 * detected the same way, by comparing the incoming chunk fingerprint set
 * against the current document's fingerprint set — so both are reported as
 * UNCHANGED. No new rows are ever created in either case.
 */
export type IngestionOutcome = "NEW" | "UNCHANGED" | "UPDATED";

export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionError";
  }
}
