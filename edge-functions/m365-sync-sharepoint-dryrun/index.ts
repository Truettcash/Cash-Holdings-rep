// Edge Function: m365-sync-sharepoint-dryrun
// Phase 1 dry-run for Microsoft 365 SharePoint -> Cash Holdings CRM sync.
// READ ONLY: No writes to Supabase, no updates/inserts/deletes, no SharePoint writes.

import { createClient } from "npm:@supabase/supabase-js@2.5.0";

const REQUIRED_ENV = [
  "M365_TENANT_ID",
  "M365_CLIENT_ID",
  "M365_CLIENT_SECRET",
  "SUPABASE_URL",
];

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function stableNormalizeForHash(payload: any) {
  const seen = new WeakSet();
  const sorter = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (seen.has(obj)) return undefined;
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(sorter);
    const out: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sorter(obj[key]);
    return out;
  };
  return sorter(payload);
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function truncate(v: string, maxLen: number) {
  if (!v) return v;
  if (v.length <= maxLen) return v;
  return v.slice(0, maxLen);
}

function buildSourceFieldsMap(itemFieldsObj: Record<string, any>) {
  const get = (k: string) =>
    Object.prototype.hasOwnProperty.call(itemFieldsObj, k) ? itemFieldsObj[k] : undefined;

  return {
    account_id: get("Title"),
    external_lead_id: get("field_1"),
    account_name: get("field_2"),
    account_type: get("field_3"),
    account_status: get("field_4"),
    account_owner: get("field_5"),
    brand_route: get("field_6"),
    tier: get("field_7"),
    industry: get("field_8"),
    city: get("field_9"),
    market: get("field_10"),
    main_phone: get("field_11"),
    website_url: get("field_15"),
    website_host: get("field_16"),
    website_status: get("field_17"),
    primary_channel: get("field_18"),
    contact_route: get("field_19"),
    observed_gap: get("field_27"),
    source_url_1: get("field_28"),
    source_url_2: get("field_29"),
    external_created_at: get("field_30"),
    external_dedup_key: get("field_31"),
    notes: get("field_32"),
    active: get("field_33"),
    pipeline_stage: get("field_35"),
    call_status: get("field_36"),
    contact_name: get("field_37"),
    contact_role: get("field_38"),
    decision_authority: get("field_39"),
    verified_phone: get("field_40"),
    verified_email: get("field_41"),
    attempt_count: get("field_42"),
    last_contact_date: get("field_43"),
    call_outcome: get("field_44"),
    need_confirmed: get("field_45"),
    interest_level: get("field_46"),
    offer_discussed: get("field_47"),
    quoted_price: get("field_48"),
    probability: get("field_49"),
    weighted_pipeline: get("field_50"),
    next_action: get("field_51"),
    next_action_date: get("field_52"),
    proposal_status: get("field_53"),
    closed_outcome: get("field_54"),
    revenue_won: get("field_55"),
    call_notes: get("field_56"),
    source_stage: get("Stage"),
    raw_fields: itemFieldsObj,
  };
}

function normalizeGraphValueForHash(v: any) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalizeGraphValueForHash);
  return v;
}

async function graphFetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const status = res.status;
    throw Object.assign(new Error(`graph_error_http_${status}`), { http_status: status });
  }
  return await res.json();
}

Deno.serve(async (req) => {
  const started = Date.now();

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  const supabaseUrl = mustGetEnv("SUPABASE_URL");
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");

  const supabase = createClient(supabaseUrl, accessToken, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(req.url);
  const integration_connection_id = url.searchParams.get("integration_connection_id") || (await req.json().catch(() => null))?.integration_connection_id;
  if (!integration_connection_id) {
    return new Response(JSON.stringify({ ok: false, error: "missing_integration_connection_id" }), { status: 400 });
  }

  const { data: conn, error: connErr } = await supabase
    .from("integration_connections")
    .select("id, provider, channel_id, provider_external_account_id")
    .eq("id", integration_connection_id)
    .single();

  if (connErr || !conn) {
    return new Response(JSON.stringify({ ok: false, error: "integration_connection_not_accessible" }), { status: 403 });
  }

  const tenantId = mustGetEnv("M365_TENANT_ID");
  const clientId = mustGetEnv("M365_CLIENT_ID");
  const clientSecret = mustGetEnv("M365_CLIENT_SECRET");

  const siteId = "athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73";
  const listId = "6aae0aa7-a978-4d0d-a67e-ffbbd5a11108";

  const providerCursorTop = 50;

  async function getM365AppAccessToken() {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "client_credentials");
    body.set("scope", "https://graph.microsoft.com/.default");
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`microsoft_auth_failed_http_${res.status}`);
    const json = await res.json();
    if (!json?.access_token) throw new Error("microsoft_auth_failed_no_access_token");
    return json.access_token as string;
  }

  const accessTokenM365 = await getM365AppAccessToken();

  const { data: brands, error: brandsErr } = await supabase
    .from("brands")
    .select("id,key,name")
    .order("created_at", { ascending: true });
  if (brandsErr) {
    return new Response(JSON.stringify({ ok: false, error: "brands_load_failed" }), { status: 500 });
  }

  const brandKeyByKey = new Map<string, any>();
  const brandById = new Map<string, any>();
  for (const b of brands || []) {
    if (b?.key) brandKeyByKey.set(String(b.key), b);
    if (b?.id) brandById.set(String(b.id), b);
  }

  const deterministicBrandRouteMap = new Map<string, { brand_id: string; brand_key: string }>([
    [
      "Truett Cash",
      {
        brand_id: "145c3111-8618-4509-ad78-24e18490bf3d",
        brand_key: "truett-cash",
      },
    ],
    [
      "Authority Systems",
      {
        brand_id: "6cc09698-a5ff-44bc-95e6-162e64fb9998",
        brand_key: "authority-systems",
      },
    ],
    [
      "ATHRTY.SYS",
      {
        brand_id: "6cc09698-a5ff-44bc-95e6-162e64fb9998",
        brand_key: "authority-systems",
      },
    ],
  ]);

  const resolveCanonicalBrand = (brandRoute: string) => {
    const routeMapping = deterministicBrandRouteMap.get(brandRoute) || null;
    if (!routeMapping) return null;

    const candidateById = brandById.get(routeMapping.brand_id) || null;
    const candidateByKey = brandKeyByKey.get(routeMapping.brand_key) || null;

    if (candidateById?.key === routeMapping.brand_key) return candidateById;
    if (candidateByKey?.id === routeMapping.brand_id) return candidateByKey;
    return null;
  };

  const initialUrl = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?` +
    `$expand=fields&$top=${providerCursorTop}` +
    `&$select=id,createdDateTime,lastModifiedDateTime,fields` +
    `&$orderby=createdDateTime desc`;

  let nextUrl: string | null = initialUrl;
  let recordsRead = 0;

  const proposedSamples: any[] = [];

  const brandRoutesDistinct = new Map<string, { route: string; resolved: boolean; brand: any | null }>();
  const brandRouteRecordCounts = new Map<string, number>();

  const opCounts = { new: 0, changed: 0, unchanged: 0, ambiguous: 0, invalid: 0 };

  const organizationExistingIds = new Set<string>();
  const organizationInsertKeys = new Set<string>();
  const organizationUpdateIds = new Set<string>();
  const organizationAmbiguousKeys = new Set<string>();

  const contactExistingIds = new Set<string>();
  const contactInsertKeys = new Set<string>();
  const contactUpdateIds = new Set<string>();
  const contactAmbiguousKeys = new Set<string>();
  let contactsSkippedNoPersonData = 0;

  const engagementExistingIds = new Set<string>();
  const engagementInsertKeys = new Set<string>();
  const engagementUpdateIds = new Set<string>();
  const engagementAmbiguousKeys = new Set<string>();

  const distinctAccountIds = new Set<string>();
  const duplicateAccountIds = new Set<string>();
  const accountIdSeen = new Map<string, number>();

  const distinctLeadIds = new Set<string>();
  const duplicateLeadIds = new Set<string>();
  const leadIdSeen = new Map<string, number>();

  let named_person = 0;
  let named_person_with_email = 0;
  let named_person_with_phone = 0;
  let email_only_no_name = 0;
  let phone_only_no_name = 0;
  let role_only_no_name = 0;
  let no_person_data = 0;

  const externalKeyMatch = async (external_site_id: string, external_list_id: string, external_item_id: string) => {
    const { data, error } = await supabase
      .from("integration_source_records")
      .select("id, source_hash, mapping_status, external_account_id, external_lead_id, organization_id, contact_id, engagement_id")
      .eq("integration_connection_id", integration_connection_id)
      .eq("resource_type", "sharepoint_list_item")
      .eq("external_site_id", external_site_id)
      .eq("external_list_id", external_list_id)
      .eq("external_item_id", external_item_id)
      .maybeSingle();
    if (error) return { existing: null, err: error };
    return { existing: data || null, err: null };
  };

  while (nextUrl) {
    const json = await graphFetchJson(nextUrl, accessTokenM365);
    const items = json?.value ?? [];

    for (const it of items) {
      recordsRead += 1;
      const itemId = String(it?.id ?? "");
      const fieldsObj = it?.fields;
      const itemFieldsObj = (fieldsObj && typeof fieldsObj === "object" && !Array.isArray(fieldsObj)) ? fieldsObj : {};

      const mapped = buildSourceFieldsMap(itemFieldsObj);

      const external_account_id = mapped.account_id ? String(mapped.account_id) : undefined;
      const external_lead_id = mapped.external_lead_id ? String(mapped.external_lead_id) : undefined;
      const external_item_id = itemId;

      const brand_route = mapped.brand_route ? String(mapped.brand_route) : "";
      const resolvedBrand = brand_route ? resolveCanonicalBrand(brand_route) : null;

      if (brand_route) {
        brandRouteRecordCounts.set(brand_route, (brandRouteRecordCounts.get(brand_route) ?? 0) + 1);
        if (!brandRoutesDistinct.has(brand_route)) {
          brandRoutesDistinct.set(brand_route, {
            route: brand_route,
            resolved: !!resolvedBrand,
            brand: resolvedBrand,
          });
        }
      }

      const normalizedPayload = {
        account_id: normalizeGraphValueForHash(mapped.account_id),
        external_lead_id: normalizeGraphValueForHash(mapped.external_lead_id),
        account_name: normalizeGraphValueForHash(mapped.account_name),
        brand_route: normalizeGraphValueForHash(mapped.brand_route),
        tier: normalizeGraphValueForHash(mapped.tier),
        industry: normalizeGraphValueForHash(mapped.industry),
        city: normalizeGraphValueForHash(mapped.city),
        market: normalizeGraphValueForHash(mapped.market),
        website_url: normalizeGraphValueForHash(mapped.website_url),
        website_host: normalizeGraphValueForHash(mapped.website_host),
        website_status: normalizeGraphValueForHash(mapped.website_status),
        primary_channel: normalizeGraphValueForHash(mapped.primary_channel),
        contact_route: normalizeGraphValueForHash(mapped.contact_route),
        pipeline_stage: normalizeGraphValueForHash(mapped.pipeline_stage),
        call_status: normalizeGraphValueForHash(mapped.call_status),
        contact_name: normalizeGraphValueForHash(mapped.contact_name),
        contact_role: normalizeGraphValueForHash(mapped.contact_role),
        decision_authority: normalizeGraphValueForHash(mapped.decision_authority),
        verified_phone: normalizeGraphValueForHash(mapped.verified_phone),
        verified_email: normalizeGraphValueForHash(mapped.verified_email),
        attempt_count: normalizeGraphValueForHash(mapped.attempt_count),
        last_contact_date: normalizeGraphValueForHash(mapped.last_contact_date),
        call_outcome: normalizeGraphValueForHash(mapped.call_outcome),
        need_confirmed: normalizeGraphValueForHash(mapped.need_confirmed),
        interest_level: normalizeGraphValueForHash(mapped.interest_level),
        offer_discussed: normalizeGraphValueForHash(mapped.offer_discussed),
        quoted_price: normalizeGraphValueForHash(mapped.quoted_price),
        probability: normalizeGraphValueForHash(mapped.probability),
        weighted_pipeline: normalizeGraphValueForHash(mapped.weighted_pipeline),
        next_action: normalizeGraphValueForHash(mapped.next_action),
        next_action_date: normalizeGraphValueForHash(mapped.next_action_date),
        proposal_status: normalizeGraphValueForHash(mapped.proposal_status),
        closed_outcome: normalizeGraphValueForHash(mapped.closed_outcome),
        revenue_won: normalizeGraphValueForHash(mapped.revenue_won),
        call_notes: normalizeGraphValueForHash(mapped.call_notes),
        source_stage: normalizeGraphValueForHash(mapped.source_stage),
      };

      const source_hash = await sha256Hex(JSON.stringify(stableNormalizeForHash(normalizedPayload)));

      if (!external_item_id || !external_account_id) {
        opCounts.invalid += 1;
        continue;
      }

      if (external_account_id) {
        distinctAccountIds.add(external_account_id);
        const c = (accountIdSeen.get(external_account_id) ?? 0) + 1;
        accountIdSeen.set(external_account_id, c);
        if (c >= 2) duplicateAccountIds.add(external_account_id);
      }
      if (external_lead_id) {
        distinctLeadIds.add(external_lead_id);
        const c = (leadIdSeen.get(external_lead_id) ?? 0) + 1;
        leadIdSeen.set(external_lead_id, c);
        if (c >= 2) duplicateLeadIds.add(external_lead_id);
      }

      const { existing } = await externalKeyMatch(siteId, listId, external_item_id);

      let classification: keyof typeof opCounts;
      if (!existing) classification = "new";
      else if (!existing.source_hash) classification = "ambiguous";
      else if (existing.source_hash === source_hash) classification = "unchanged";
      else classification = "changed";

      opCounts[classification] += 1;

      const organizationKey = `${resolvedBrand?.id ?? "unresolved"}|${external_account_id}`;
      const contactKey = `${external_item_id}|${external_lead_id ?? "no-lead"}`;
      const engagementKey = `${external_item_id}|${external_lead_id ?? "no-lead"}`;

      const contact_name_raw = mapped.contact_name;
      const contact_name = typeof contact_name_raw === "string" ? contact_name_raw.trim() : "";
      const contact_role_raw = mapped.contact_role;
      const contact_role = typeof contact_role_raw === "string" ? contact_role_raw.trim() : "";
      const verified_email_raw = mapped.verified_email;
      const verified_email = typeof verified_email_raw === "string" ? verified_email_raw.trim() : "";
      const verified_phone_raw = mapped.verified_phone;
      const verified_phone = typeof verified_phone_raw === "string" ? verified_phone_raw.trim() : "";

      const has_named_person = contact_name.length > 0;
      const has_email = verified_email.length > 0;
      const has_phone = verified_phone.length > 0;
      const has_role = contact_role.length > 0;

      if (!has_named_person && !has_email && !has_phone && !has_role) {
        no_person_data += 1;
      } else if (has_named_person) {
        named_person += 1;
        if (has_email) named_person_with_email += 1;
        if (has_phone) named_person_with_phone += 1;
      } else {
        if (has_email && !has_phone) email_only_no_name += 1;
        else if (has_phone && !has_email) phone_only_no_name += 1;
        else if (has_role && !has_email && !has_phone) role_only_no_name += 1;
      }

      if (!resolvedBrand || !mapped.account_name || classification === "ambiguous") {
        organizationAmbiguousKeys.add(organizationKey);
      } else if (existing?.organization_id) {
        organizationExistingIds.add(String(existing.organization_id));
        if (classification === "changed") organizationUpdateIds.add(String(existing.organization_id));
      } else if (classification === "unchanged") {
        organizationAmbiguousKeys.add(organizationKey);
      } else {
        organizationInsertKeys.add(organizationKey);
      }

      const hasPersonForContactProposal = has_named_person;
      if (!hasPersonForContactProposal) {
        contactsSkippedNoPersonData += 1;
      } else if (!resolvedBrand || classification === "ambiguous") {
        contactAmbiguousKeys.add(contactKey);
      } else if (existing?.contact_id) {
        contactExistingIds.add(String(existing.contact_id));
        if (classification === "changed") contactUpdateIds.add(String(existing.contact_id));
      } else if (classification === "unchanged") {
        contactAmbiguousKeys.add(contactKey);
      } else {
        contactInsertKeys.add(contactKey);
      }

      if (!resolvedBrand || !external_lead_id || classification === "ambiguous") {
        engagementAmbiguousKeys.add(engagementKey);
      } else if (existing?.engagement_id) {
        engagementExistingIds.add(String(existing.engagement_id));
        if (classification === "changed") engagementUpdateIds.add(String(existing.engagement_id));
      } else if (classification === "unchanged") {
        engagementAmbiguousKeys.add(engagementKey);
      } else {
        engagementInsertKeys.add(engagementKey);
      }

      if (proposedSamples.length < 5) {
        proposedSamples.push({
          sharepoint_item_id: external_item_id,
          account_id: external_account_id,
          lead_id: external_lead_id || null,
          proposed_organization_action: existing ? (classification === "unchanged" ? "NO CHANGE" : "UPDATE") : "INSERT",
          proposed_contact_action: hasPersonForContactProposal
            ? existing
              ? (classification === "unchanged" ? "NO CHANGE" : "UPSERT (by future external identity)")
              : "INSERT"
            : "SKIP (no named person)",
          proposed_engagement_action: existing ? (classification === "unchanged" ? "NO CHANGE" : "UPSERT engagement by lead_id") : "INSERT",
        });
      }
    }

    nextUrl = json?.['@odata.nextLink'] ?? null;
  }

  const brandRoutesDiagnostics = Array.from(brandRoutesDistinct.values()).map((v) => ({
    source_brand_route: v.route,
    record_count: brandRouteRecordCounts.get(v.route) ?? 0,
  }));

  const dryRunResult = {
    ok: true,
    mode: "m365_sharepoint_sync_dryrun",
    source: {
      provider: "microsoft_365",
      site: siteId,
      list: "ATHRTY Outbound",
      external_list_id: listId,
      records_read: recordsRead,
    },
    SOURCE_IDENTITY: {
      records_read: recordsRead,
      distinct_account_ids: distinctAccountIds.size,
      duplicate_account_ids: duplicateAccountIds.size,
      distinct_lead_ids: distinctLeadIds.size,
      duplicate_lead_ids: duplicateLeadIds.size,
    },
    BRAND_DISTRIBUTION: brandRoutesDiagnostics,
    CONTACT_QUALITY: {
      named_person,
      named_person_with_email,
      named_person_with_phone,
      email_only_no_name,
      phone_only_no_name,
      role_only_no_name,
      no_person_data,
    },
    brand_routes: Array.from(brandRoutesDistinct.values()).map((v) => ({
      source_brand_route: v.route,
      matched_brand_key: v.brand?.key ?? null,
      matched_brand_id: v.brand?.id ?? null,
      mapping_confidence: v.brand ? "deterministic" : "unresolved",
    })),
    source_records: {
      new: opCounts.new,
      changed: opCounts.changed,
      unchanged: opCounts.unchanged,
      ambiguous: opCounts.ambiguous,
      invalid: opCounts.invalid,
    },
    organizations: {
      existing: organizationExistingIds.size,
      proposed_inserts: organizationInsertKeys.size,
      proposed_updates: organizationUpdateIds.size,
      ambiguous: organizationAmbiguousKeys.size,
    },
    contacts: {
      existing: contactExistingIds.size,
      proposed_inserts: contactInsertKeys.size,
      proposed_updates: contactUpdateIds.size,
      skipped_no_person_data: contactsSkippedNoPersonData,
      ambiguous: contactAmbiguousKeys.size,
    },
    engagements: {
      existing: engagementExistingIds.size,
      proposed_inserts: engagementInsertKeys.size,
      proposed_updates: engagementUpdateIds.size,
      ambiguous: engagementAmbiguousKeys.size,
    },
    deals: { writes_enabled: false },
    engagement_events: { writes_enabled: false },
    writes: 0,
    errors: [],
    proposed_mapping_samples: proposedSamples,
    duration_ms: Date.now() - started,
  };

  for (const s of dryRunResult.proposed_mapping_samples) {
    if (typeof s.account_id === "string") s.account_id = truncate(s.account_id, 64);
    if (typeof s.lead_id === "string") s.lead_id = truncate(s.lead_id, 64);
  }

  return new Response(JSON.stringify(dryRunResult), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
