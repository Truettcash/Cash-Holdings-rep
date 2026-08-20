/**
 * Cash Intelligence — explicit-origin CORS gate.
 *
 * Shared by the three governed intelligence Edge Functions deployed on the
 * external Cash Holdings project (`ldijllskwwmyhhbzspmb`):
 *
 *   - knowledge-mcp-read
 *   - intelligence-mcp-read
 *   - intelligence-promotion-write
 *
 * Rules (do not relax):
 *   - No `Access-Control-Allow-Origin: *`, ever.
 *   - Exact string match on the request `Origin` against ALLOWED_ORIGINS.
 *   - Origin approval is NOT authorization. It runs before the JWT check and
 *     never replaces it. Order stays: origin -> JWT -> owner role -> operation.
 *   - Approved headers must be merged into EVERY response the function returns,
 *     including 401 / 403 / 4xx / 5xx, or the browser hides the real status and
 *     surfaces "Failed to fetch" instead.
 */

export const ALLOWED_ORIGINS: readonly string[] = [
  // Production Cash Holdings
  "https://cash-holdings-os.lovable.app",
  // Preview origins actually served by this Lovable project
  "https://887516ad-65bf-4188-a5c1-e2c4a467c50b.lovableproject.com",
  "https://id-preview--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app",
  "https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app",
  "https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b-dev.lovable.app",
];

export type CorsDecision = {
  /** True only when the request Origin is on the allow-list. */
  approved: boolean;
  /** The raw request Origin (may be null for non-browser callers). */
  origin: string | null;
  /** Headers to merge into every response. Empty object when not approved. */
  headers: Record<string, string>;
};

/** Resolve the CORS decision for a request. Call this first in the handler. */
export function resolveCors(req: Request): CorsDecision {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return { approved: false, origin, headers: {} };
  }
  return {
    approved: true,
    origin,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      // Never let a shared cache serve one origin's headers to another.
      Vary: "Origin",
    },
  };
}

/**
 * Preflight response. Approved origins get 204 + headers; everything else gets
 * a bare 403 with no `Access-Control-*` headers, so the browser blocks it.
 */
export function preflight(cors: CorsDecision): Response {
  if (!cors.approved) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: { ...cors.headers, "Access-Control-Max-Age": "86400" },
  });
}

/** Merge the approved CORS headers into an existing response. */
export function withCors(res: Response, cors: CorsDecision): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors.headers)) headers.set(k, v);
  if (!cors.approved) headers.set("Vary", "Origin");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/** Convenience JSON responder that always carries the CORS decision. */
export function json(body: unknown, status: number, cors: CorsDecision): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors.headers,
      ...(cors.approved ? {} : { Vary: "Origin" }),
    },
  });
}