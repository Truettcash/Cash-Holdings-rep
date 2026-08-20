// Edge Function: m365-sync-sharepoint
// PRODUCTION: Microsoft 365 SharePoint -> Cash Holdings CRM sync.
// Patch ONLY: restore v1 preflight diagnostics + duplicate identity tracking.

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

function normalizeGraphValueForHash(v: any) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalizeGraphValueForHash);
  return v;
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

function deterministicBrandRouteMap() {
  return new Map<string, { brand_id: string; brand_key: string }>([
    ["Truett Cash", { brand_id: "145c3111-8618-4509-ad78-24e18490bf3d", brand_key: "truett-cash" }],
    ["Authority Systems", { brand_id: "6cc09698-a5ff-44bc-95e6-162e64fb9998", brand_key: "authority-systems" }],
    ["ATHRTY.SYS", { brand_id: "6cc09698-a5ff-44bc-95e6-162e64fb9998", brand_key: "authority-systems" }],
  ]);
}

function mustGetSupabaseServiceRoleKey(): string {
  const v = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!v) throw new Error("Missing service role key env var");
  return v;
}

function blankToNullString(v: any) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  // if it's non-string but truthy, keep as-is (unlikely for this field)
  return v ?? null;
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

  const serviceRoleKey = mustGetSupabaseServiceRoleKey();
  const supabaseWriter = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(req.url);
  const integration_connection_id =
    url.searchParams.get("integration_connection_id") ||
    (await req.json().catch(() => null))?.integration_connection_id;

  if (integration_connection_id !== "f304a30c-b8c4-4d94-9860-e8634efe6b1f") {
    return new Response(JSON.stringify({ ok: false, error: "invalid_integration_connection_id" }), { status: 400 });
  }

  const siteId = "athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73";
  const listId = "6aae0aa7-a978-4d0d-a67e-ffbbd5a11108";

  const tenantId = mustGetEnv("M365_TENANT_ID");
  const clientId = mustGetEnv("M365_CLIENT_ID");
  const clientSecret = mustGetEnv("M365_CLIENT_SECRET");

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

  const { data: brands, error: brandsErr } = await supabaseWriter
    .from("brands")
    .select("id,key")
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

  const routeMap = deterministicBrandRouteMap();
  const resolveCanonicalBrandKey = (brandRoute: string) => {
    const mapping = routeMap.get(brandRoute) || null;
    if (!mapping) return null;
    const candidateById = brandById.get(mapping.brand_id) || null;
    const candidateByKey = brandKeyByKey.get(mapping.brand_key) || null;
    if (candidateById?.key === mapping.brand_key) return mapping.brand_key;
    if (candidateByKey?.id === mapping.brand_id) return mapping.brand_key;
    return null;
  };

  const providerCursorTop = 50;
  const initialUrl =
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?` +
    `$expand=fields&$top=${providerCursorTop}` +
    `&$select=id,eTag,createdDateTime,lastModifiedDateTime,fields` +
    `&$orderby=createdDateTime desc`;

  let nextUrl: string | null = initialUrl;
  const records: any[] = [];

  let recordsRead = 0;

  // RESTORE DUPLICATE ID TRACKING
  const distinctAccountIds = new Set<string>();
  const duplicateAccountIds = new Set<string>();
  const accountIdSeen = new Map<string, number>();

  const distinctLeadIds = new Set<string>();
  const duplicateLeadIds = new Set<string>();
  const leadIdSeen = new Map<string, number>();

  // RESTORE CONTACT DIAGNOSTICS
  let named_contacts = 0;
  let unnamed_records = 0;

  const brandDistribution: Record<string, number> = {
    "Truett Cash": 0,
    "Authority Systems": 0,
    "ATHRTY.SYS": 0,
  };

  function fail(reason: string, diagnostics: any, status = 400) {
    return new Response(JSON.stringify({ ok: false, error: reason, ...diagnostics }), { status });
  }

  while (nextUrl) {
    let json: any;
    try {
      json = await graphFetchJson(nextUrl, accessTokenM365);
    } catch (_e: any) {
      return new Response(JSON.stringify({ ok: false, error: "graph_fetch_failed" }), { status: 502 });
    }

    const items = json?.value ?? [];

    for (const it of items) {
      recordsRead += 1;

      const itemId = String(it?.id ?? "");
      const fieldsObj = it?.fields;
      const itemFieldsObj =
        fieldsObj && typeof fieldsObj === "object" && !Array.isArray(fieldsObj) ? fieldsObj : {};

      const mapped = buildSourceFieldsMap(itemFieldsObj);

      const external_item_id = itemId;
      const external_account_id = mapped.account_id != null ? String(mapped.account_id) : "";
      const external_lead_id = mapped.external_lead_id != null ? String(mapped.external_lead_id) : "";

      const account_name = mapped.account_name != null ? String(mapped.account_name) : "";

      if (!external_item_id.trim() || !external_account_id.trim() || !external_lead_id.trim() || !account_name.trim()) {
        return fail("validation_failed_missing_identity", {
          diagnostics: {
            records_read: recordsRead,
            external_item_id,
            external_account_id,
            external_lead_id,
            account_name,
          },
        });
      }

      const brand_route = mapped.brand_route ? String(mapped.brand_route) : "";
      if (!brand_route.trim()) {
        return fail("validation_failed_missing_brand_route", { diagnostics: { records_read: recordsRead, external_item_id } });
      }

      const brand_key = resolveCanonicalBrandKey(brand_route);
      if (!brand_key) {
        return fail("validation_failed_unresolved_brand_route", {
          diagnostics: { records_read: recordsRead, external_item_id, brand_route },
        });
      }

      if (brandDistribution[brand_route] !== undefined) brandDistribution[brand_route] += 1;

      // Contact diagnostics (restore)
      const contact_name_raw = mapped.contact_name;
      const contact_name = typeof contact_name_raw === "string" ? contact_name_raw.trim() : "";
      if (contact_name.length > 0) named_contacts += 1;
      else unnamed_records += 1;

      // HASH INPUT must remain identical to dry-run
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

      // RESTORE duplicate tracking
      distinctAccountIds.add(external_account_id);
      const accountCount = (accountIdSeen.get(external_account_id) ?? 0) + 1;
      accountIdSeen.set(external_account_id, accountCount);
      if (accountCount >= 2) duplicateAccountIds.add(external_account_id);

      distinctLeadIds.add(external_lead_id);
      const leadCount = (leadIdSeen.get(external_lead_id) ?? 0) + 1;
      leadIdSeen.set(external_lead_id, leadCount);
      if (leadCount >= 2) duplicateLeadIds.add(external_lead_id);

      const contact_role_raw = mapped.contact_role;
      const contact_role = typeof contact_role_raw === "string" ? contact_role_raw.trim() : "";
      const verified_email_raw = mapped.verified_email;
      const verified_email = typeof verified_email_raw === "string" ? verified_email_raw.trim() : "";
      const verified_phone_raw = mapped.verified_phone;
      const verified_phone = typeof verified_phone_raw === "string" ? verified_phone_raw.trim() : "";

      // Preserve v2 metadata fixes
      const external_etag = it?.eTag ?? null;
      const external_created_at = it?.createdDateTime ?? null;
      const external_modified_at = it?.lastModifiedDateTime ?? null;

      const next_action_date = blankToNullString(mapped.next_action_date);

      const normalizedRecord = {
        external_site_id: siteId,
        external_list_id: listId,
        external_item_id: external_item_id,

        external_account_id,
        external_lead_id,
        external_dedup_key: mapped.external_dedup_key != null ? String(mapped.external_dedup_key) : null,

        external_etag,
        external_created_at,
        external_modified_at,

        account_name,
        brand_key,

        website_url: typeof mapped.website_url === "string" ? mapped.website_url : null,
        industry: typeof mapped.industry === "string" ? mapped.industry : null,
        city: typeof mapped.city === "string" ? mapped.city : null,

        contact_name,
        contact_role,
        verified_phone,
        verified_email,

        pipeline_stage: typeof mapped.pipeline_stage === "string" ? mapped.pipeline_stage : null,
        next_action: typeof mapped.next_action === "string" ? mapped.next_action : null,
        next_action_date,

        source_hash,
        source_payload: {
          normalizedPayload,
          mapped,
        },
      };

      if (!normalizedRecord.source_hash || !normalizedRecord.external_item_id) {
        return fail("validation_failed_invalid_normalized_payload", { diagnostics: { records_read: recordsRead, external_item_id } });
      }

      records.push(normalizedRecord);
    }

    nextUrl = json?.['@odata.nextLink'] ?? null;
  }

  // FAIL COMPLETE BATCH ON DUPLICATE BUSINESS IDENTITIES
  if (duplicateAccountIds.size > 0 || duplicateLeadIds.size > 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "validation_failed_duplicate_identity",
        preflight: {
          records_read: recordsRead,
          distinct_account_ids: distinctAccountIds.size,
          duplicate_account_ids: duplicateAccountIds.size,
          distinct_lead_ids: distinctLeadIds.size,
          duplicate_lead_ids: duplicateLeadIds.size,
          brand_distribution: brandDistribution,
          named_contacts,
          unnamed_records,
        },
      }),
      { status: 400 }
    );
  }

  if (!records.length) {
    return new Response(JSON.stringify({ ok: false, error: "validation_failed_empty_batch", records_read: recordsRead }), { status: 400 });
  }

  const preflight = {
    records_read: recordsRead,
    distinct_account_ids: distinctAccountIds.size,
    duplicate_account_ids: duplicateAccountIds.size,
    distinct_lead_ids: distinctLeadIds.size,
    duplicate_lead_ids: duplicateLeadIds.size,
    brand_distribution: brandDistribution,
    named_contacts,
    unnamed_records,
  };

  try {
    const { data, error } = await supabaseWriter.rpc(
      "sync_m365_sharepoint_athrty_outbound_v1",
      {
        p_integration_connection_id: integration_connection_id,
        p_records: records,
        p_execution_metadata: {
          function_name: "m365-sync-sharepoint",
          source: "microsoft_365",
          provider: "microsoft_365",
          site_id: siteId,
          list_id: listId,
          records_fetched: recordsRead,
          invocation_mode: "production",
        },
      },
    );

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: "rpc_raised", rpc_error: String(error.message || error) }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "m365_sharepoint_sync",
        source: { provider: "microsoft_365", list: "ATHRTY Outbound", records_read: recordsRead },
        preflight,
        writer: data ?? null,
        writes_committed: true,
        duration_ms: Date.now() - started,
      }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (_e: any) {
    return new Response(JSON.stringify({ ok: false, error: "rpc_call_failed" }), { status: 500 });
  }
});
