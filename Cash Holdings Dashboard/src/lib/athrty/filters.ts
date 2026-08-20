import { dueBucket, isClosed, isContacted, type AthrtyRecord } from "./model";

export type AthrtyFilters = {
  q: string;
  brand: string;
  stage: string;
  tier: string;
  market: string;
  accountStatus: string;
  callStatus: string;
  interest: string;
  owner: string;
  contact: "all" | "present" | "missing";
  due: "all" | "overdue" | "today" | "upcoming" | "none";
  modified: "all" | "7d" | "30d";
};

export const EMPTY_FILTERS: AthrtyFilters = {
  q: "",
  brand: "all",
  stage: "all",
  tier: "all",
  market: "all",
  accountStatus: "all",
  callStatus: "all",
  interest: "all",
  owner: "all",
  contact: "all",
  due: "all",
  modified: "all",
};

export const hasActiveFilters = (f: AthrtyFilters) =>
  Object.entries(f).some(([k, v]) => v !== (EMPTY_FILTERS as Record<string, string>)[k]);

/** Distinct, sorted values for a compact select. */
export function options(records: AthrtyRecord[], get: (r: AthrtyRecord) => string | null) {
  const set = new Set<string>();
  for (const r of records) {
    const v = get(r);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function matchesSearch(r: AthrtyRecord, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    r.company,
    r.accountId,
    r.leadId,
    r.contact?.name,
    r.contact?.email,
    r.contact?.phone,
    r.phone,
    r.city,
    r.market,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needle
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

const eq = (value: string | null, selected: string) =>
  selected === "all" || (value ?? "") === selected;

export function applyFilters(records: AthrtyRecord[], f: AthrtyFilters): AthrtyRecord[] {
  const now = Date.now();
  return records.filter((r) => {
    if (!matchesSearch(r, f.q)) return false;
    if (!eq(r.canonicalBrand, f.brand)) return false;
    if (!eq(r.stage, f.stage)) return false;
    if (!eq(r.tier, f.tier)) return false;
    if (!eq(r.market, f.market)) return false;
    if (!eq(r.accountStatus, f.accountStatus)) return false;
    if (!eq(r.callStatus, f.callStatus)) return false;
    if (!eq(r.interest, f.interest)) return false;
    if (!eq(r.owner, f.owner)) return false;
    if (f.contact === "present" && !r.contact) return false;
    if (f.contact === "missing" && r.contact) return false;
    if (f.due !== "all" && dueBucket(r.nextActionDate) !== f.due) return false;
    if (f.modified !== "all") {
      const window = f.modified === "7d" ? 7 : 30;
      const t = new Date(r.externalModifiedAt ?? r.lastSyncedAt ?? 0).getTime();
      if (!t || now - t > window * 86_400_000) return false;
    }
    return true;
  });
}

export type SortKey =
  | "company"
  | "brand"
  | "tier"
  | "market"
  | "city"
  | "stage"
  | "callStatus"
  | "attempts"
  | "interest"
  | "probability"
  | "nextActionDate"
  | "owner"
  | "modified";

const sortValue = (r: AthrtyRecord, key: SortKey): string | number => {
  switch (key) {
    case "company":
      return (r.company ?? "").toLowerCase();
    case "brand":
      return (r.canonicalBrand ?? "").toLowerCase();
    case "tier":
      return (r.tier ?? "").toLowerCase();
    case "market":
      return (r.market ?? "").toLowerCase();
    case "city":
      return (r.city ?? "").toLowerCase();
    case "stage":
      return (r.stage ?? "").toLowerCase();
    case "callStatus":
      return (r.callStatus ?? "").toLowerCase();
    case "attempts":
      return r.attempts ?? -1;
    case "interest":
      return (r.interest ?? "").toLowerCase();
    case "probability":
      return r.probability ?? -1;
    case "nextActionDate":
      return r.nextActionDate ? new Date(r.nextActionDate).getTime() : Number.MAX_SAFE_INTEGER;
    case "owner":
      return (r.owner ?? "").toLowerCase();
    case "modified":
      return new Date(r.externalModifiedAt ?? r.lastSyncedAt ?? 0).getTime();
  }
};

export function sortRecords(records: AthrtyRecord[], key: SortKey, dir: "asc" | "desc") {
  const factor = dir === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

export type AthrtyMetrics = {
  accounts: number;
  leads: number;
  namedContacts: number;
  openPipeline: number;
  followUpsDue: number;
  contacted: number;
  notContacted: number;
  highInterest: number;
  recentChanges: number;
};

export function computeMetrics(records: AthrtyRecord[], openValue: (r: AthrtyRecord) => number): AthrtyMetrics {
  const now = Date.now();
  let openPipeline = 0;
  let followUpsDue = 0;
  let contacted = 0;
  let highInterest = 0;
  let recentChanges = 0;
  let leads = 0;
  let namedContacts = 0;

  for (const r of records) {
    openPipeline += openValue(r);
    const bucket = dueBucket(r.nextActionDate);
    if ((bucket === "overdue" || bucket === "today") && !isClosed(r)) followUpsDue += 1;
    if (isContacted(r)) contacted += 1;
    if ((r.interest ?? "").toLowerCase().includes("high")) highInterest += 1;
    const modified = new Date(r.externalModifiedAt ?? r.lastSyncedAt ?? 0).getTime();
    if (modified && now - modified <= 7 * 86_400_000) recentChanges += 1;
    if (r.engagementId) leads += 1;
    if (r.contact) namedContacts += 1;
  }

  return {
    accounts: records.length,
    leads,
    namedContacts,
    openPipeline,
    followUpsDue,
    contacted,
    notContacted: records.length - contacted,
    highInterest,
    recentChanges,
  };
}