import { q } from "@/lib/data";
import { callOperation, INTEL_FUNCTIONS, isUnsupported } from "@/lib/cash-intelligence/service";
import { rows } from "@/lib/cash-intelligence/normalize";
import type { Row } from "@/lib/cash-intelligence/types";

/**
 * "Search what Cash knows" — one universal retrieval used by both the Open
 * Knowledge surface and Jarvis. Knowledge and Intelligence resolve through the
 * governed Edge Function read layer; Work and CRM resolve through the existing
 * RLS-bound table reads. Nothing is derived or cached beyond React Query.
 */

export type KnownCategory = "knowledge" | "work" | "crm" | "intelligence";

export type KnownResult = {
  id: string;
  title: string;
  type: string;
  category: KnownCategory;
  context?: string;
  excerpt?: string;
  source?: string;
  to?: string;
};

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const pick = (r: Row, keys: string[]): string => {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

function matches(query: string, ...fields: (string | undefined)[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

async function safe<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (isUnsupported(e)) return fallback;
    return fallback;
  }
}

async function searchKnowledge(query: string): Promise<KnownResult[]> {
  if (query.trim().length < 3) return [];
  return safe(async () => {
    const out = await callOperation(
      INTEL_FUNCTIONS.knowledge,
      ["search"],
      { query },
    );
    return rows(out, ["matches", "hits", "content", "documents"]).map((r, i) => ({
      id: pick(r, ["id", "content_id", "document_id"]) || `k-${i}`,
      title: pick(r, ["heading", "title", "document_title", "name"]) || "Untitled record",
      type: pick(r, ["kind", "type", "content_type"]) || "Document",
      category: "knowledge" as const,
      context: pick(r, ["workspace", "brand", "brand_key", "scope"]) || undefined,
      excerpt: (pick(r, ["body", "excerpt", "snippet", "text"]) || "").slice(0, 320) || undefined,
      source: pick(r, ["source_name", "source", "uri", "source_id"]) || undefined,
      to: "/intelligence/inputs",
    }));
  }, []);
}

async function searchIntelligence(query: string): Promise<KnownResult[]> {
  return safe(async () => {
    const out = await callOperation(
      INTEL_FUNCTIONS.intelligence,
      ["list_patterns"],
      {},
    );
    return rows(out, ["patterns"])
      .map((r, i) => ({
        id: pick(r, ["id", "pattern_id", "pattern_key"]) || `i-${i}`,
        title: pick(r, ["pattern_key", "title", "name", "summary"]) || "Intelligence pattern",
        type: "Pattern",
        category: "intelligence" as const,
        context: pick(r, ["brand", "brand_key", "scope", "workspace"]) || undefined,
        excerpt: (pick(r, ["summary", "rationale", "notes", "description"]) || "").slice(0, 320) || undefined,
        source: "Intelligence library",
        to: "/intelligence/findings",
      }))
      .filter((r) => matches(query, r.title, r.excerpt, r.context));
  }, []);
}

async function searchWork(query: string): Promise<KnownResult[]> {
  const [brands, projects, tasks] = await Promise.all([
    safe(() => q.brands(), []),
    safe(() => q.projects(), []),
    safe(() => q.tasks(), []),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const projBrand = new Map(projects.map((p) => [p.id, brandName.get(p.brand_id) ?? ""]));

  const out: KnownResult[] = [];
  for (const b of brands) {
    if (!matches(query, b.name, b.slug)) continue;
    out.push({
      id: b.id,
      title: b.name,
      type: "Brand",
      category: "work",
      context: "Portfolio",
      to: `/brand/${b.slug}`,
    });
  }
  for (const p of projects) {
    if (!matches(query, p.name, text(p.status), brandName.get(p.brand_id))) continue;
    out.push({
      id: p.id,
      title: p.name,
      type: "Project",
      category: "work",
      context: brandName.get(p.brand_id) ?? undefined,
      excerpt: text(p.status) || undefined,
      to: "/projects",
    });
  }
  for (const t of tasks) {
    if (t.status === "completed" || t.status === "archived") continue;
    if (!matches(query, t.title, projName.get(t.project_id))) continue;
    out.push({
      id: t.id,
      title: t.title,
      type: "Task",
      category: "work",
      context: projBrand.get(t.project_id) || projName.get(t.project_id) || undefined,
      excerpt: text(t.status) || undefined,
      to: "/tasks",
    });
  }
  return out;
}

async function searchCrm(query: string): Promise<KnownResult[]> {
  const [orgs, contacts, deals] = await Promise.all([
    safe(() => q.organizations(), []),
    safe(() => q.contacts(), []),
    safe(() => q.deals(), []),
  ]);
  const out: KnownResult[] = [];
  for (const o of orgs) {
    if (!matches(query, o.name)) continue;
    out.push({ id: o.id, title: o.name, type: "Organization", category: "crm", to: "/crm" });
  }
  for (const c of contacts) {
    if (!matches(query, c.full_name)) continue;
    out.push({ id: c.id, title: c.full_name, type: "Contact", category: "crm", to: "/crm" });
  }
  for (const d of deals) {
    if (!matches(query, d.name)) continue;
    out.push({
      id: d.id,
      title: d.name,
      type: "Deal",
      category: "crm",
      excerpt: text((d as unknown as Row).stage) || undefined,
      to: "/crm",
    });
  }
  return out;
}

export async function searchWhatCashKnows(
  query: string,
  categories: KnownCategory[] = ["knowledge", "work", "crm", "intelligence"],
): Promise<KnownResult[]> {
  const want = new Set(categories);
  const parts = await Promise.all([
    want.has("knowledge") ? searchKnowledge(query) : Promise.resolve([]),
    want.has("work") ? searchWork(query) : Promise.resolve([]),
    want.has("crm") ? searchCrm(query) : Promise.resolve([]),
    want.has("intelligence") ? searchIntelligence(query) : Promise.resolve([]),
  ]);
  return parts.flat();
}