import { bool, date, num, obj, str, urls, type Row } from "./fields";

export type AthrtyContact = {
  id: string | null;
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
};

export type AthrtyRecord = {
  /** integration_source_records.id */
  id: string;
  organizationId: string | null;
  contactId: string | null;
  engagementId: string | null;

  // Identity / provenance
  sharepointItemId: string | null;
  accountId: string | null;
  leadId: string | null;
  mappingStatus: string | null;
  externalCreatedAt: string | null;
  externalModifiedAt: string | null;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  sourceList: string | null;
  sourceRoute: string | null;
  canonicalBrand: string | null;

  // Account
  company: string | null;
  accountType: string | null;
  accountStatus: string | null;
  tier: string | null;
  industry: string | null;
  city: string | null;
  market: string | null;
  website: string | null;
  phone: string | null;

  contact: AthrtyContact | null;

  // Sales state
  stage: string | null;
  callStatus: string | null;
  attempts: number | null;
  lastContactDate: string | null;
  callOutcome: string | null;
  needConfirmed: boolean | null;
  interest: string | null;
  offerDiscussed: string | null;
  quotedPrice: number | null;
  probability: number | null;
  weightedPipeline: number | null;
  proposalStatus: string | null;
  closedOutcome: string | null;
  revenueWon: number | null;

  // Action
  nextAction: string | null;
  nextActionDate: string | null;
  owner: string | null;

  // Notes
  observedGap: string | null;
  notes: string | null;
  callNotes: string | null;
  sourceUrls: string[];

  payload: Row | null;
};

/** Canonical brand keys currently in use. Source routes collapse into these. */
export const CANONICAL_BRANDS: Record<string, string> = {
  "truett-cash": "Truett Cash",
  "authority-systems": "Authority Systems",
};

export function brandLabel(key: string | null): string {
  if (!key) return "Unrouted";
  return CANONICAL_BRANDS[key] ?? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Presentation-layer normalization only — the database keeps whatever the
 * source produced. `raw` is preserved so filters and grouping stay faithful.
 */
export function stageLabel(raw: string | null): string {
  if (!raw) return "Unstaged";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stageTone(
  raw: string | null,
): "muted" | "neutral" | "teal" | "warn" | "danger" | "success" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("won") || s.includes("closed won")) return "success";
  if (s.includes("lost")) return "danger";
  if (s.includes("proposal") || s.includes("qualified")) return "teal";
  if (s.includes("follow")) return "warn";
  if (!s) return "muted";
  return "neutral";
}

export function interestTone(
  raw: string | null,
): "muted" | "neutral" | "teal" | "warn" | "danger" | "success" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("high")) return "success";
  if (s.includes("medium") || s.includes("mid")) return "teal";
  if (s.includes("low")) return "neutral";
  if (s.includes("none") || s.includes("not")) return "muted";
  return "muted";
}

export const isHighInterest = (r: AthrtyRecord) =>
  (r.interest ?? "").toLowerCase().includes("high");

export const isContacted = (r: AthrtyRecord) => {
  const cs = (r.callStatus ?? "").toLowerCase();
  if (r.lastContactDate) return true;
  if ((r.attempts ?? 0) > 0) return true;
  if (!cs) return false;
  return !(cs.includes("not") || cs.includes("no contact") || cs === "new");
};

export const isClosed = (r: AthrtyRecord) => {
  const s = (r.stage ?? "").toLowerCase();
  return s.includes("won") || s.includes("lost") || s.includes("closed");
};

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type DueBucket = "overdue" | "today" | "upcoming" | "none";

export function dueBucket(iso: string | null): DueBucket {
  if (!iso) return "none";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "none";
  const today = startOfToday();
  const tomorrow = today + 86_400_000;
  if (t < today) return "overdue";
  if (t < tomorrow) return "today";
  return "upcoming";
}

/**
 * Builds the operating-surface record from the source record plus its linked
 * normalized rows. Field names are resolved tolerantly (see fields.ts) so the
 * live production spelling wins over any assumption made here.
 */
export function buildRecord(args: {
  source: Row;
  organization: Row | null;
  contact: Row | null;
  engagement: Row | null;
}): AthrtyRecord {
  const { source, organization, contact, engagement } = args;
  const payload =
    obj([source], ["source_payload", "payload", "raw_payload", "source_data"]) ?? null;
  const nested = obj([payload], ["fields", "columns", "values"]);
  // Ordered by trust: normalized rows first, then the SharePoint payload.
  const all: (Row | null)[] = [engagement, organization, source, payload, nested];
  const acct: (Row | null)[] = [organization, engagement, source, payload, nested];
  const sales: (Row | null)[] = [engagement, payload, nested, source];

  const contactName = str(
    [contact, payload, nested],
    ["full_name", "name", "contact_name", "contact", "primary_contact", "person"],
  );
  const hasContact = Boolean(
    str([source], ["contact_id"]) ?? (contact ? str([contact], ["id"]) : null) ?? contactName,
  );

  return {
    id: String(str([source], ["id"]) ?? ""),
    organizationId: str([source], ["organization_id"]),
    contactId: str([source], ["contact_id"]),
    engagementId: str([source], ["engagement_id"]),

    sharepointItemId: str(
      [source, payload, nested],
      ["external_id", "sharepoint_item_id", "source_item_id", "item_id", "external_item_id"],
    ),
    accountId: str(all, ["account_id", "accountid", "account"]),
    leadId: str(all, ["lead_id", "leadid", "lead"]),
    mappingStatus: str([source], ["mapping_status", "status", "state", "sync_state"]),
    externalCreatedAt: date([source, payload, nested], [
      "external_created_at",
      "source_created_at",
      "created_at_source",
      "created",
    ]),
    externalModifiedAt: date([source, payload, nested], [
      "external_modified_at",
      "source_modified_at",
      "modified",
      "last_modified",
    ]),
    lastSeenAt: date([source], ["last_seen_at", "seen_at"]),
    lastSyncedAt: date([source], ["last_synced_at", "synced_at", "updated_at"]),
    sourceList: str([source, payload, nested], ["source_list", "list_name", "list"]),
    sourceRoute: str(
      [payload, nested, source],
      ["source_route", "brand_route", "route", "source_brand", "brand_source"],
    ),
    canonicalBrand: str(
      [engagement, source, organization],
      ["brand_key", "canonical_brand", "brand", "brand_slug"],
    ),

    company: str(acct, ["company_name", "company", "name", "account_name", "organization"]),
    accountType: str(acct, ["account_type", "type", "business_type"]),
    accountStatus: str(acct, ["account_status", "status", "lead_status"]),
    tier: str(acct, ["tier", "account_tier", "priority_tier"]),
    industry: str(acct, ["industry", "vertical", "category"]),
    city: str(acct, ["city", "town", "locality"]),
    market: str(acct, ["market", "metro", "region", "territory"]),
    website: str(acct, ["website", "url", "site", "web"]),
    phone: str(acct, ["phone", "company_phone", "business_phone", "phone_number"]),

    contact: hasContact
      ? {
          id: str([contact], ["id"]),
          name: contactName,
          role: str([contact, payload, nested], ["title", "role", "position", "job_title"]),
          phone: str([contact, payload, nested], ["phone", "mobile", "contact_phone", "direct"]),
          email: str([contact, payload, nested], ["email", "contact_email", "email_address"]),
        }
      : null,

    stage: str(sales, ["pipeline_stage", "stage", "sales_stage"]),
    callStatus: str(sales, ["call_status", "contact_status", "outreach_status"]),
    attempts: num(sales, ["attempt_count", "attempts", "call_attempts", "touches"]),
    lastContactDate: date(sales, ["last_contact_date", "last_contacted_at", "last_touch"]),
    callOutcome: str(sales, ["call_outcome", "outcome", "last_outcome"]),
    needConfirmed: bool(sales, ["need_confirmed", "needconfirmed", "confirmed_need"]),
    interest: str(sales, ["interest_level", "interest"]),
    offerDiscussed: str(sales, ["offer_discussed", "offer", "offer_presented"]),
    quotedPrice: num(sales, ["quoted_price", "quote", "price_quoted", "quote_amount"]),
    probability: num(sales, ["probability", "win_probability", "close_probability"]),
    weightedPipeline: num(sales, ["weighted_pipeline", "weighted_value", "weighted"]),
    proposalStatus: str(sales, ["proposal_status", "proposal"]),
    closedOutcome: str(sales, ["closed_outcome", "close_outcome", "final_outcome"]),
    revenueWon: num(sales, ["revenue_won", "revenue", "won_amount", "closed_revenue"]),

    nextAction: str(sales, ["next_action", "nextstep", "next_step", "action"]),
    nextActionDate: date(sales, [
      "next_action_date",
      "next_action_due",
      "next_step_date",
      "follow_up_date",
      "due_date",
    ]),
    owner: str(sales, ["owner", "assigned_to", "rep", "account_owner"]),

    observedGap: str(sales, ["observed_gap", "gap", "opportunity_gap"]),
    notes: str(sales, ["notes", "note", "comments"]),
    callNotes: str(sales, ["call_notes", "call_note", "conversation_notes"]),
    sourceUrls: urls([payload, nested, organization], [
      "website",
      "url",
      "source_url",
      "profile_url",
      "listing_url",
      "maps_url",
      "linkedin",
      "source_urls",
    ]),

    payload,
  };
}

/** Effective pipeline value for open records: quote × probability when both exist. */
export function openValue(r: AthrtyRecord): number {
  if (isClosed(r)) return 0;
  if (r.weightedPipeline !== null) return r.weightedPipeline;
  const price = r.quotedPrice ?? 0;
  const p = r.probability === null ? null : r.probability > 1 ? r.probability / 100 : r.probability;
  return p === null ? price : price * p;
}