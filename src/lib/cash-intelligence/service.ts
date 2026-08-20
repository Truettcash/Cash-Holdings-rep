import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import type { Row } from "./types";

/**
 * Governed transport for the three deployed Cash Intelligence Edge Functions.
 *
 * - Identity is always the authenticated Supabase user JWT. The browser never
 *   sends owner_user_id / actor_user_id / approved_by, never sees a service
 *   role key, and never issues SQL.
 * - No table reads happen here: the Edge Functions are the only read path.
 */

export const INTEL_FUNCTIONS = {
  knowledge: "knowledge-mcp-read",
  intelligence: "intelligence-mcp-read",
  promotion: "intelligence-promotion-write",
} as const;

export type IntelFunction = (typeof INTEL_FUNCTIONS)[keyof typeof INTEL_FUNCTIONS];

const BASE = `${import.meta.env.VITE_CASH_SUPABASE_URL as string}/functions/v1`;
const APIKEY = import.meta.env.VITE_CASH_SUPABASE_PUBLISHABLE_KEY as string;

export type IntelErrorCode =
  | "AUTH_REQUIRED"
  | "UNREACHABLE"
  | "UNSUPPORTED_OPERATION"
  | "FORBIDDEN"
  | "SERVICE_ERROR";

export class IntelServiceError extends Error {
  code: IntelErrorCode;
  status: number | null;
  detail: string | null;
  constructor(code: IntelErrorCode, message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = "IntelServiceError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function accessToken(): Promise<string> {
  const { data } = await cashHoldingsSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new IntelServiceError("AUTH_REQUIRED", "No authenticated operator session.");
  return token;
}

function unwrap(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as Row;
  if ("error" in p && p.error) {
    const err = p.error as Row | string;
    const code = typeof err === "object" ? String((err as Row).code ?? "") : "";
    const message = typeof err === "object" ? String((err as Row).message ?? code) : String(err);
    throw classify(message, code, 200);
  }
  for (const key of ["data", "result", "results", "payload"]) {
    if (key in p) return p[key];
  }
  return p;
}

function classify(message: string, code: string, status: number): IntelServiceError {
  const blob = `${code} ${message}`.toUpperCase();
  if (status === 401 || blob.includes("AUTH")) {
    return new IntelServiceError("AUTH_REQUIRED", "Operator session is not authorized.", status, message);
  }
  if (status === 403 || blob.includes("FORBIDDEN") || blob.includes("OWNER")) {
    return new IntelServiceError("FORBIDDEN", "Operator is not permitted to perform this read.", status, message);
  }
  if (
    status === 404 ||
    blob.includes("UNKNOWN_OPERATION") ||
    blob.includes("UNSUPPORTED_OPERATION") ||
    blob.includes("INVALID_OPERATION") ||
    blob.includes("INVALID_ACTION") ||
    blob.includes("UNKNOWN_ACTION") ||
    blob.includes("NOT_FOUND")
  ) {
    return new IntelServiceError("UNSUPPORTED_OPERATION", "Operation is not exposed by the service.", status, message);
  }
  return new IntelServiceError("SERVICE_ERROR", message || "Intelligence service error.", status, message);
}

/** Raw single call. Returns the unwrapped payload of the service envelope. */
export async function callFunction(fn: IntelFunction, body: Row): Promise<unknown> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}/${fn}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: APIKEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IntelServiceError(
      "UNREACHABLE",
      `${fn} is unreachable from this origin (network or CORS).`,
    );
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const p = (parsed ?? {}) as Row;
    const err = (p.error ?? p) as Row | string;
    const code = typeof err === "object" ? String((err as Row).code ?? "") : "";
    const message =
      typeof err === "object"
        ? String((err as Row).message ?? (code || res.statusText))
        : String(err || res.statusText);
    throw classify(message, code, res.status);
  }
  return unwrap(parsed);
}

export async function callOperation(
  fn: IntelFunction,
  candidates: string[],
  params: Row = {},
): Promise<unknown> {
  const action = candidates[0];
  if (!action) {
    throw new IntelServiceError("UNSUPPORTED_OPERATION", "No intelligence action was specified.");
  }

  // Both deployed readers use a strict, flat request schema. Extra legacy
  // `operation` or nested `params` keys are rejected as INVALID_INPUT.
  return callFunction(fn, { action, ...params });
}

/** True when a failure means "the backend does not expose this", not "broken". */
export function isUnsupported(error: unknown): boolean {
  return error instanceof IntelServiceError && error.code === "UNSUPPORTED_OPERATION";
}