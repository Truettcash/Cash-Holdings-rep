// Edge Function: m365-sharepoint-discovery
// Discovery-only for SharePoint information architecture.
// READ ONLY: no writes, no downloads of document contents.

// IMPORTANT: This function relies on the Supabase platform JWT gate (verify_jwt = true).
// Do NOT implement any custom auth layer using SUPABASE_SECRET_KEYS/service role.

const REQUIRED_ENV = [
  "M365_TENANT_ID",
  "M365_CLIENT_ID",
  "M365_CLIENT_SECRET",
] as const;

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getM365AppAccessToken(tenantId: string, clientId: string, clientSecret: string) {
  // client_credentials flow proven by m365-connection-health.
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "client_credentials");
  // Microsoft Graph default scope.
  body.set("scope", "https://graph.microsoft.com/.default");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    // Do not include response body with secrets.
    throw new Error(`microsoft_auth_failed: http_${res.status}`);
  }

  const json = await res.json();
  const access_token = json?.access_token;
  if (!access_token) throw new Error("microsoft_auth_failed: no_access_token");
  return access_token as string;
}

function pickFacet(value: any) {
  if (!value || typeof value !== "object") return undefined;
  if (value.folder) return "folder";
  if (value.file) return "file";
  return undefined;
}

function truncateDiscoveryString(v: string, maxLen: number) {
  if (v.length <= maxLen) return v;
  // Keep the content but cap length; indicate truncation without logging.
  return `${v.slice(0, maxLen)}…[truncated]`;
}

function sanitizeFieldsObject(fields: Record<string, any> | undefined, maxLen = 500) {
  // Return an OBJECT with internal field names as keys.
  // Values are sanitized for discovery: truncate very large strings.
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};

  const out: Record<string, any> = {};
  for (const [k, raw] of Object.entries(fields)) {
    if (raw === undefined) continue;
    if (raw === null) {
      out[k] = null;
      continue;
    }

    if (typeof raw === "string") {
      out[k] = truncateDiscoveryString(raw, maxLen);
      continue;
    }

    if (Array.isArray(raw)) {
      // Preserve structure; sanitize string elements.
      out[k] = raw.map((item) => {
        if (typeof item === "string") return truncateDiscoveryString(item, maxLen);
        return item;
      });
      continue;
    }

    if (typeof raw === "number" || typeof raw === "boolean") {
      out[k] = raw;
      continue;
    }

    // For objects, keep as-is (Graph usually returns primitives inside fields).
    // If it's too large, we still avoid stringification—keep minimal.
    out[k] = raw;
  }

  return out;
}

async function graphFetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const status = res.status;
    throw Object.assign(new Error(`graph_error_http_${status}`), { http_status: status });
  }
  return await res.json();
}

async function getListColumns(siteId: string, listId: string, accessToken: string, maxColumns = 500) {
  // Graph: GET /sites/{site-id}/lists/{list-id}/columns
  const url = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/columns?$top=1000`;
  const json = await graphFetchJson(url, accessToken);
  const cols = (json?.value ?? []) as any[];

  const mapped = cols.slice(0, maxColumns).map((c: any) => ({
    id: c?.id,
    name: c?.name,
    displayName: c?.displayName,
    description: c?.description,
    required: c?.required ?? undefined,
    readOnly: c?.readOnly ?? undefined,
    hidden: c?.hidden ?? undefined,
    column_type: c?.type?.toString ? c.type.toString() : c?.type,
    // Facets vary across column types; provide best-effort scalar hints.
    facets: c?.columnType ? [c.columnType] : undefined,
  }));

  return mapped;
}

function buildIdentityFieldPresence(listColumns: any[], sampleFieldsObject: Record<string, any> | undefined) {
  const fieldsObj = sampleFieldsObject && typeof sampleFieldsObject === "object" && !Array.isArray(sampleFieldsObject)
    ? sampleFieldsObject
    : undefined;

  const hasKey = (internalKey: string | undefined) => !!(internalKey && fieldsObj && Object.prototype.hasOwnProperty.call(fieldsObj, internalKey));

  // Map concept -> internal field name via displayName provided by Graph list columns.
  const findInternalByDisplay = (display: string) => {
    const col = listColumns.find((c) => c?.displayName === display);
    return col?.name as string | undefined;
  };

  return {
    lead_id: hasKey(findInternalByDisplay("Lead ID")),
    account_id: hasKey(findInternalByDisplay("Account ID")),
    contact_id: hasKey(findInternalByDisplay("Contact ID")),
    opportunity_id: hasKey(findInternalByDisplay("Opportunity ID")),
    email: hasKey(findInternalByDisplay("Email Primary")),
    contact_email: hasKey(findInternalByDisplay("Contact Email")),
    verified_email: hasKey(findInternalByDisplay("Verified Email")),
    website: hasKey(findInternalByDisplay("Website URL")),
    dedup_key: hasKey(findInternalByDisplay("Dedup Key")),
    title: hasKey(findInternalByDisplay("Title")),
  };
}

async function getListItemCountAndSample(
  siteId: string,
  listId: string,
  accessToken: string,
  opts: {
    topPageSize: number;
    maxPages: number;
    sampleTop: number;
  },
) {
  const { topPageSize, maxPages, sampleTop } = opts;

  let itemCount = 0;
  let truncated = false;
  let nextUrl: string | null = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?$top=${topPageSize}&$select=id,createdDateTime,lastModifiedDateTime&$orderby=createdDateTime desc`;

  for (let page = 0; page < maxPages; page++) {
    if (!nextUrl) break;
    const json = await graphFetchJson(nextUrl, accessToken);
    const values = json?.value ?? [];
    itemCount += values.length;
    nextUrl = json?.['@odata.nextLink'] ?? null;
    if (!nextUrl) break;
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
  }

  // Sample: request a small number with limited fields.
  // IMPORTANT: request list item fields using $expand=fields.
  const sampleUrl = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$top=${sampleTop}` +
    `&$select=id,createdDateTime,lastModifiedDateTime,fields&$orderby=createdDateTime desc`;

  const sampleJson = await graphFetchJson(sampleUrl, accessToken);
  const sampleValues = sampleJson?.value ?? [];

  const sample_items = sampleValues.slice(0, sampleTop).map((it: any) => ({
    id: it?.id,
    createdDateTime: it?.createdDateTime,
    lastModifiedDateTime: it?.lastModifiedDateTime,
    fields: sanitizeFieldsObject(it?.fields ?? undefined),
  }));

  return { item_count: itemCount, sample_items, truncated };
}

async function getDriveRootChildren(siteId: string, driveId: string, accessToken: string, opts: {
  topPageSize: number;
  maxPages: number;
}) {
  const { topPageSize, maxPages } = opts;

  let root_item_count = 0;
  let truncated = false;
  let nextUrl: string | null = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children?$top=${topPageSize}`;

  const root_items: any[] = [];
  const maxRootItemsToReturn = 50;

  for (let page = 0; page < maxPages; page++) {
    if (!nextUrl) break;
    const json = await graphFetchJson(nextUrl, accessToken);
    const values = json?.value ?? [];
    root_item_count += values.length;

    for (const v of values) {
      if (root_items.length >= maxRootItemsToReturn) break;
      root_items.push({
        id: v?.id,
        name: v?.name,
        webUrl: v?.webUrl,
        size: v?.size,
        createdDateTime: v?.createdDateTime,
        lastModifiedDateTime: v?.lastModifiedDateTime,
        facet: pickFacet(v),
      });
    }

    nextUrl = json?.['@odata.nextLink'] ?? null;
    if (!nextUrl) break;
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
  }

  return { root_item_count, root_items, truncated };
}

Deno.serve(async (req) => {
  const started = Date.now();

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }

  const tenantId = mustGetEnv("M365_TENANT_ID");
  const clientId = mustGetEnv("M365_CLIENT_ID");
  const clientSecret = mustGetEnv("M365_CLIENT_SECRET");

  const siteId = "athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73";

  const brandKey = "athrty";

  const response: any = {
    ok: true,
    provider: "microsoft_365",
    brand_key: brandKey,
    mode: "sharepoint_discovery",
    site: {
      id: siteId,
      name: "ATHRTY-SYSTEM-INTERNAL",
    },
    lists: [],
    drives: [],
    summary: {
      business_lists_inspected: 0,
      total_items_across_business_lists: 0,
      document_libraries_inspected: 0,
    },
    duration_ms: 0,
    truncated: {
      lists: false,
      drives: false,
    },
  };

  let accessToken = "";
  try {
    accessToken = await getM365AppAccessToken(tenantId, clientId, clientSecret);
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error_code: e?.message?.includes("microsoft_auth_failed") ? "microsoft_auth_failed" : "microsoft_auth_failed" }),
      { status: 401 },
    );
  }

  const businessLists = [
    { id: "e0f13447-b45d-4bb5-896b-054c129046c9", name: "Contacts Pipeline" },
    { id: "9c9c6c4e-a3f2-4def-9151-49d6f8b84646", name: "Email List Contacts" },
    { id: "6c70be9b-e834-4aff-94c5-58721c5c1d56", name: "Pipeline" },
    { id: "134d7ee9-cea1-4301-99ce-6e006e138e2a", name: "ATHRTY-Lead-CRM" },
    { id: "0752cd8d-e83f-4580-b9bc-87f7b61deef5", name: "ATHRTY Contacts" },
    { id: "659b629d-febd-4cc4-8b97-b62bfd5c9ddf", name: "Email Contacts" },
    { id: "d079dbf7-dc7f-4883-91ff-c67f0cc13957", name: "ATHRTY-Regional-Expansion" },
    { id: "6aae0aa7-a978-4d0d-a67e-ffbbd5a11108", name: "ATHRTY Outbound" },
  ];

  // Safety limits (preserved)
  const LIST_TOP_PAGE_SIZE = 80;
  const LIST_MAX_PAGES = 30;

  const DRIVE_TOP_PAGE_SIZE = 100;
  const DRIVE_MAX_PAGES = 12;

  let totalItems = 0;

  for (const bl of businessLists) {
    response.summary.business_lists_inspected += 1;
    const listEntry: any = {
      id: bl.id,
      name: bl.name,
      displayName: undefined,
      item_count: 0,
      column_count: 0,
      columns: [],
      sample_items: [],
      identity_fields: {},
    };

    try {
      const columns = await getListColumns(siteId, bl.id, accessToken);
      listEntry.columns = columns.map((c: any) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        description: c.description,
        required: c.required,
        readOnly: c.readOnly,
        hidden: c.hidden,
        column_type: c.column_type,
        facet: Array.isArray(c.facets) ? c.facets[0] : undefined,
      }));
      listEntry.column_count = listEntry.columns.length;
      listEntry.displayName = columns[0]?.displayName ?? bl.name;
    } catch (e: any) {
      const http_status = e?.http_status;
      listEntry.read_success = false;
      listEntry.error_code = "list_schema_failed";
      if (http_status) listEntry.http_status = http_status;
      response.lists.push(listEntry);
      continue;
    }

    try {
      const { item_count, sample_items, truncated } = await getListItemCountAndSample(siteId, bl.id, accessToken, {
        topPageSize: LIST_TOP_PAGE_SIZE,
        maxPages: LIST_MAX_PAGES,
        sampleTop: 3,
      });

      listEntry.item_count = item_count;
      listEntry.sample_items = sample_items;

      const firstSampleFields = sample_items?.[0]?.fields;
      listEntry.identity_fields = buildIdentityFieldPresence(listEntry.columns, firstSampleFields);

      if (truncated) {
        response.truncated.lists = true;
        listEntry.truncated = true;
      }

      totalItems += item_count;
      listEntry.read_success = true;
    } catch (e: any) {
      const http_status = e?.http_status;
      listEntry.read_success = false;
      listEntry.error_code = "list_items_failed";
      if (http_status) listEntry.http_status = http_status;
    }

    response.lists.push(listEntry);
  }

  response.summary.total_items_across_business_lists = totalItems;

  const drivesToInspect = [
    { id: "b!cpS1UGHoT06LzIHsjTAmRsT7GfbKBN5HvYbm8qqwKnPbaWnPckGNQpTnVjVXOSTE", name: "Assets" },
    { id: "b!cpS1UGHoT06LzIHsjTAmRsT7GfbKBN5HvYbm8qqwKnPy8AmMuoe2R6WCy5RLuY5U", name: "Documents" },
  ];

  for (const d of drivesToInspect) {
    response.summary.document_libraries_inspected += 1;
    const driveEntry: any = {
      id: d.id,
      name: d.name,
      root_item_count: 0,
      root_items: [],
    };

    try {
      const { root_item_count, root_items, truncated } = await getDriveRootChildren(siteId, d.id, accessToken, {
        topPageSize: DRIVE_TOP_PAGE_SIZE,
        maxPages: DRIVE_MAX_PAGES,
      });
      driveEntry.root_item_count = root_item_count;
      driveEntry.root_items = root_items;

      if (truncated) {
        response.truncated.drives = true;
        driveEntry.truncated = true;
      }

      driveEntry.read_success = true;
    } catch (e: any) {
      const http_status = e?.http_status;
      driveEntry.read_success = false;
      driveEntry.error_code = "drive_discovery_failed";
      if (http_status) driveEntry.http_status = http_status;
    }

    response.drives.push(driveEntry);
  }

  response.duration_ms = Date.now() - started;

  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
