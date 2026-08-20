type HealthResponse = {
  ok: boolean;
  provider: string;
  brand_key: string;
  connection: string;
  mode: string;
  configuration?: {
    tenant_id_present: boolean;
    client_id_present: boolean;
    client_secret_present: boolean;
  };
  authentication?: {
    token_request_success: boolean;
    http_status: number | null;
  };
  // Safe Microsoft token diagnostics (no descriptions/raw body)
  microsoft_error?: string;
  microsoft_error_code?: number;
  sharepoint?: {
    site_read_success: boolean;
    http_status: number | null;
    site?: {
      id: string;
      name: string;
      displayName: string;
      webUrl: string;
    };
  };
  lists?: {
    read_success: boolean;
    http_status: number | null;
    count: number;
    resources: Array<{ id: string; name: string; displayName: string; webUrl: string }>;
  };
  drives?: {
    read_success: boolean;
    http_status: number | null;
    count: number;
    resources: Array<{ id: string; name: string; driveType: string; webUrl: string }>;
  };
  error_code?:
    | 'missing_configuration'
    | 'microsoft_auth_failed'
    | 'graph_access_denied'
    | 'sharepoint_site_not_found'
    | 'lists_read_failed'
    | 'drives_read_failed'
    | 'unexpected_error'
    | string;
  stage?: string;
  duration_ms?: number;
};

const BRAND_KEY = 'athrty';
const CONNECTION = 'Cash Holdings | ATHRTY Connector';

const SITE_ID = 'athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Connection': 'keep-alive',
    },
  });
}

function getEnvPresence(key: string): boolean {
  const v = Deno.env.get(key);
  return typeof v === 'string' && v.trim().length > 0;
}

async function parseGraphObject<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    // Never expose upstream body; only status/code.
    throw new Error(`graph_http_${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`graph_json_${res.status}`);
  }
}

Deno.serve(async (req) => {
  const start = Date.now();
  console.info('m365-connection-health boot');

  // Enforce authenticated invocation (platform-level JWT verification is expected).
  const authz = req.headers.get('Authorization');
  if (!authz || !authz.startsWith('Bearer ')) {
    const resp: HealthResponse = {
      ok: false,
      provider: 'microsoft_365',
      brand_key: BRAND_KEY,
      connection: CONNECTION,
      mode: 'read_only_health_check',
      stage: 'auth',
      error_code: 'unexpected_error',
      duration_ms: Date.now() - start,
    };
    return jsonResponse(resp, 401);
  }

  try {
    // CHECK 1 — CONFIGURATION
    const tenant_id_present = getEnvPresence('M365_TENANT_ID');
    const client_id_present = getEnvPresence('M365_CLIENT_ID');
    const client_secret_present = getEnvPresence('M365_CLIENT_SECRET');

    if (!tenant_id_present || !client_id_present || !client_secret_present) {
      const resp: HealthResponse = {
        ok: false,
        provider: 'microsoft_365',
        brand_key: BRAND_KEY,
        connection: CONNECTION,
        mode: 'read_only_health_check',
        configuration: {
          tenant_id_present,
          client_id_present,
          client_secret_present,
        },
        stage: 'configuration',
        error_code: 'missing_configuration',
        duration_ms: Date.now() - start,
      };
      return jsonResponse(resp, 500);
    }

    const responseBase: HealthResponse = {
      ok: false,
      provider: 'microsoft_365',
      brand_key: BRAND_KEY,
      connection: CONNECTION,
      mode: 'read_only_health_check',
      configuration: {
        tenant_id_present,
        client_id_present,
        client_secret_present,
      },
    };

    // CHECK 2 — MICROSOFT TOKEN
    const tenantId = Deno.env.get('M365_TENANT_ID')!;
    const clientId = Deno.env.get('M365_CLIENT_ID')!;
    const clientSecret = Deno.env.get('M365_CLIENT_SECRET')!;

    console.info('stage=token');
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    let token_http_status: number | null = null;
    let token_request_success = false;
    let access_token: string | null = null;

    // Safe Microsoft token diagnostics
    let microsoft_error: string | undefined;
    let microsoft_error_code: number | undefined;

    try {
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      });

      token_http_status = tokenRes.status;
      if (!tokenRes.ok) {
        // Parse JSON response for non-2xx. Only expose error + first error_codes item.
        try {
          const bodyText = await tokenRes.text();
          const body = JSON.parse(bodyText) as {
            error?: unknown;
            error_codes?: unknown;
          };

          if (typeof body.error === 'string') {
            microsoft_error = body.error;
          }

          if (Array.isArray(body.error_codes)) {
            const first = body.error_codes[0];
            if (typeof first === 'number') {
              microsoft_error_code = first;
            }
          }
        } catch {
          // Never expose upstream body.
        }

        token_request_success = false;
      } else {
        const bodyText = await tokenRes.text();
        const body = JSON.parse(bodyText) as { access_token?: string };
        if (body.access_token && typeof body.access_token === 'string') {
          access_token = body.access_token;
          token_request_success = true;
        }
      }
    } catch {
      token_request_success = false;
    }

    // Stop immediately on Microsoft token failure.
    if (!token_request_success || !access_token) {
      const resp: HealthResponse = {
        ...responseBase,
        ok: false,
        authentication: {
          token_request_success,
          http_status: token_http_status,
        },
        stage: 'microsoft_token',
        error_code: 'microsoft_auth_failed',
        microsoft_error,
        microsoft_error_code,
        duration_ms: Date.now() - start,
      };
      return jsonResponse(resp, 502);
    }

    const bearer = `Bearer ${access_token}`;

    // CHECK 3 — SHAREPOINT SITE
    console.info('stage=sharepoint_site');
    let sharepoint_site_http_status: number | null = null;
    let sharepoint_site_read_success = false;
    let sitePayload: { id: string; name: string; displayName: string; webUrl: string } | undefined;

    const siteUrl = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(SITE_ID)}?$select=id,name,displayName,webUrl`;
    try {
      const res = await fetch(siteUrl, {
        method: 'GET',
        headers: {
          Authorization: bearer,
          Accept: 'application/json',
        },
      });
      sharepoint_site_http_status = res.status;
      if (res.ok) {
        const json = await parseGraphObject<{ id: string; name: string; displayName: string; webUrl: string }>(res);
        sharepoint_site_read_success = true;
        sitePayload = {
          id: json.id,
          name: json.name,
          displayName: json.displayName,
          webUrl: json.webUrl,
        };
      }
    } catch {
      sharepoint_site_read_success = false;
    }

    if (!sharepoint_site_read_success || !sitePayload) {
      const httpStatus = sharepoint_site_http_status;
      const error_code = httpStatus === 404 ? 'sharepoint_site_not_found' : httpStatus === 403 ? 'graph_access_denied' : 'unexpected_error';
      const resp: HealthResponse = {
        ...responseBase,
        ok: false,
        authentication: {
          token_request_success: true,
          http_status: token_http_status,
        },
        sharepoint: {
          site_read_success: false,
          http_status: sharepoint_site_http_status,
        },
        stage: 'sharepoint_site',
        error_code,
        duration_ms: Date.now() - start,
      };
      return jsonResponse(resp, httpStatus && httpStatus >= 400 ? httpStatus : 502);
    }

    // CHECK 4 — SHAREPOINT LISTS
    console.info('stage=lists');
    let lists_http_status: number | null = null;
    let lists_read_success = false;
    let list_count = 0;
    let lists_resources: Array<{ id: string; name: string; displayName: string; webUrl: string }> = [];

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(SITE_ID)}/lists?$select=id,name,displayName,webUrl`, {
        method: 'GET',
        headers: {
          Authorization: bearer,
          Accept: 'application/json',
        },
      });
      lists_http_status = res.status;
      if (res.ok) {
        const json = await parseGraphObject<{ value?: Array<any> }>(res);
        const value = Array.isArray(json.value) ? json.value : [];
        list_count = value.length;
        lists_resources = value.map((l) => ({
          id: String(l.id ?? ''),
          name: String(l.name ?? ''),
          displayName: String(l.displayName ?? ''),
          webUrl: String(l.webUrl ?? ''),
        }));
        lists_read_success = true;
      }
    } catch {
      lists_read_success = false;
    }

    if (!lists_read_success) {
      const resp: HealthResponse = {
        ...responseBase,
        ok: false,
        authentication: {
          token_request_success: true,
          http_status: token_http_status,
        },
        sharepoint: {
          site_read_success: true,
          http_status: sharepoint_site_http_status,
          site: sitePayload,
        },
        lists: {
          read_success: false,
          http_status: lists_http_status,
          count: list_count,
          resources: [],
        },
        stage: 'lists_read',
        error_code: lists_http_status === 403 ? 'graph_access_denied' : 'lists_read_failed',
        duration_ms: Date.now() - start,
      };
      return jsonResponse(resp, lists_http_status && lists_http_status >= 400 ? lists_http_status : 502);
    }

    // CHECK 5 — DRIVES (DOCUMENT LIBRARIES)
    console.info('stage=drives');
    let drives_http_status: number | null = null;
    let drives_read_success = false;
    let drive_count = 0;
    let drives_resources: Array<{ id: string; name: string; driveType: string; webUrl: string }> = [];

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(SITE_ID)}/drives?$select=id,name,driveType,webUrl`, {
        method: 'GET',
        headers: {
          Authorization: bearer,
          Accept: 'application/json',
        },
      });
      drives_http_status = res.status;
      if (res.ok) {
        const json = await parseGraphObject<{ value?: Array<any> }>(res);
        const value = Array.isArray(json.value) ? json.value : [];
        drive_count = value.length;
        drives_resources = value.map((d) => ({
          id: String(d.id ?? ''),
          name: String(d.name ?? ''),
          driveType: String(d.driveType ?? ''),
          webUrl: String(d.webUrl ?? ''),
        }));
        drives_read_success = true;
      }
    } catch {
      drives_read_success = false;
    }

    if (!drives_read_success) {
      const resp: HealthResponse = {
        ...responseBase,
        ok: false,
        authentication: {
          token_request_success: true,
          http_status: token_http_status,
        },
        sharepoint: {
          site_read_success: true,
          http_status: sharepoint_site_http_status,
          site: sitePayload,
        },
        lists: {
          read_success: true,
          http_status: lists_http_status,
          count: list_count,
          resources: lists_resources,
        },
        drives: {
          read_success: false,
          http_status: drives_http_status,
          count: drive_count,
          resources: [],
        },
        stage: 'drives_read',
        error_code: drives_http_status === 403 ? 'graph_access_denied' : 'drives_read_failed',
        duration_ms: Date.now() - start,
      };
      return jsonResponse(resp, drives_http_status && drives_http_status >= 400 ? drives_http_status : 502);
    }

    // Ensure token not persisted or logged.
    access_token = null;

    const resp: HealthResponse = {
      ok: true,
      provider: 'microsoft_365',
      brand_key: BRAND_KEY,
      connection: CONNECTION,
      mode: 'read_only_health_check',
      configuration: {
        tenant_id_present,
        client_id_present,
        client_secret_present,
      },
      authentication: {
        token_request_success: true,
        http_status: token_http_status,
      },
      sharepoint: {
        site_read_success: true,
        http_status: sharepoint_site_http_status,
        site: sitePayload,
      },
      lists: {
        read_success: true,
        http_status: lists_http_status,
        count: list_count,
        resources: lists_resources,
      },
      drives: {
        read_success: true,
        http_status: drives_http_status,
        count: drive_count,
        resources: drives_resources,
      },
      duration_ms: Date.now() - start,
    };

    return jsonResponse(resp, 200);
  } catch (e) {
    console.info('stage=unexpected_error');
    const resp: HealthResponse = {
      ok: false,
      provider: 'microsoft_365',
      brand_key: BRAND_KEY,
      connection: CONNECTION,
      mode: 'read_only_health_check',
      stage: 'unexpected_error',
      error_code: 'unexpected_error',
      duration_ms: Date.now() - start,
    };
    return jsonResponse(resp, 500);
  }
});
