/**
 * Deterministic brand-scope derivation, matching the deployed
 * knowledge_document_brands cardinality rules exactly:
 *   0 brands => global, 1 brand => brand, 2+ brands => multi_brand.
 */
import type { BrandScopeType } from "./types.ts";
import { IngestionError } from "./types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveBrandScope(brandIds: string[]): {
  brand_scope_type: BrandScopeType;
  brand_ids: string[];
} {
  for (const id of brandIds) {
    if (!UUID_RE.test(id)) {
      throw new IngestionError(`invalid brand_id: ${id}`);
    }
  }

  const uniqueIds = Array.from(new Set(brandIds));
  const brand_scope_type: BrandScopeType =
    uniqueIds.length === 0 ? "global" : uniqueIds.length === 1 ? "brand" : "multi_brand";

  return { brand_scope_type, brand_ids: uniqueIds };
}
