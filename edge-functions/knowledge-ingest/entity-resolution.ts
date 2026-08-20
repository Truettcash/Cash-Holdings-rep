/**
 * Explicit, deterministic entity resolution. No fuzzy matching, no LLM
 * inference — a mention either names a known canonical operating row by ID
 * or it stays unresolved (native Topic/System/Offer/Concept/ExternalEntity
 * by display_name). This module never guesses that two mentions are the
 * same real-world thing.
 */
import type { CanonicalEntityTable, EntityRef } from "./types.ts";
import { IngestionError } from "./types.ts";

const CANONICAL_TABLES: ReadonlySet<CanonicalEntityTable> = new Set([
  "brands",
  "organizations",
  "contacts",
  "projects",
  "project_tasks",
  "deals",
  "integration_connections",
  "metric_definitions",
  "strategic_moves",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateEntityRef(ref: EntityRef): EntityRef {
  if (ref.canonical_type !== undefined) {
    if (!CANONICAL_TABLES.has(ref.canonical_type)) {
      throw new IngestionError(`unknown canonical_type: ${ref.canonical_type}`);
    }
    if (!ref.canonical_id || !UUID_RE.test(ref.canonical_id)) {
      throw new IngestionError("canonical_id must be a UUID when canonical_type is set");
    }
    return ref;
  }

  if (!ref.display_name || ref.display_name.trim().length === 0) {
    throw new IngestionError("display_name is required when canonical_type is absent");
  }
  return ref;
}
