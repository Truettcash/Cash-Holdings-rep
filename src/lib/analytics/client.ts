/**
 * Typed access layer for the modular `analytics` schema on the production
 * Cash Holdings project. Uses the SINGLE existing session/client — no second
 * client, no second auth session, no new storage key.
 */
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import type { Database } from "@/integrations/cash-holdings/database.types";

export type AnalyticsFunctions = Database["analytics"]["Functions"];
export type AnalyticsFunctionName = keyof AnalyticsFunctions;
type NullableArg<T> = T | null;
export type AnalyticsFunctionArgs<Name extends AnalyticsFunctionName> = Partial<{
  [Key in keyof AnalyticsFunctions[Name]["Args"]]: NullableArg<
    AnalyticsFunctions[Name]["Args"][Key]
  >;
}>;
export type AnalyticsFunctionReturns<Name extends AnalyticsFunctionName> =
  AnalyticsFunctions[Name]["Returns"];

export type AnalyticsFailure =
  /** schema not exposed to the Data API */
  | "backend-not-installed"
  /** schema is exposed but the function/signature isn't in the schema cache */
  | "function-not-found"
  /** argument set rejected by the function */
  | "invalid-parameters"
  /** signed in but not permitted (RLS / role) */
  | "forbidden"
  /** the function raised at runtime */
  | "runtime-error"
  /** network or unexpected server failure */
  | "unavailable";

export class AnalyticsRpcError extends Error {
  readonly kind: AnalyticsFailure;
  readonly code: string | null;
  readonly hint: string | null;
  /** Never rendered outside development. */
  readonly detail: string | null;
  constructor(
    kind: AnalyticsFailure,
    message: string,
    detail?: string | null,
    code?: string | null,
    hint?: string | null,
  ) {
    super(message);
    this.name = "AnalyticsRpcError";
    this.kind = kind;
    this.detail = detail ?? null;
    this.code = code ?? null;
    this.hint = hint ?? null;
  }
}

/** Schema not exposed through the Data API at all. */
const SCHEMA_NOT_EXPOSED = new Set(["PGRST106", "3F000"]);
/** Exposed, but this function/signature isn't in the schema cache. */
const FUNCTION_MISSING = new Set(["PGRST202", "PGRST200", "42883"]);
const FORBIDDEN = new Set(["42501", "PGRST301", "42P01"]);

function classify(code: string | undefined, message: string): AnalyticsFailure {
  if (code && SCHEMA_NOT_EXPOSED.has(code)) return "backend-not-installed";
  if (code && FUNCTION_MISSING.has(code)) return "function-not-found";
  if (code && FORBIDDEN.has(code)) return "forbidden";
  if (code === "22P02" || code === "22007" || code === "PGRST100") return "invalid-parameters";
  if (code && /^P0/.test(code)) return "runtime-error";
  if (/invalid schema/i.test(message)) return "backend-not-installed";
  if (/not find the function|does not exist/i.test(message)) return "function-not-found";
  if (/permission denied|jwt|not authorized/i.test(message)) return "forbidden";
  return "unavailable";
}

const MESSAGES: Record<AnalyticsFailure, string> = {
  "backend-not-installed": "Analytics backend not connected.",
  "function-not-found": "This analytics module isn't available on the backend yet.",
  "invalid-parameters": "Analytics rejected the selected filters.",
  forbidden: "This account can't read analytics.",
  "runtime-error": "Analytics couldn't complete this calculation.",
  unavailable: "Analytics is temporarily unavailable.",
};

/** Schema-scoped handle. Functions are called by unqualified name. */
const analyticsSchema = () => cashHoldingsSupabase.schema("analytics");

export async function analyticsRpc<Name extends AnalyticsFunctionName>(
  fn: Name,
  params?: AnalyticsFunctionArgs<Name>,
): Promise<AnalyticsFunctionReturns<Name>> {
  const rpcParams = params as AnalyticsFunctions[Name]["Args"] | undefined;
  const { data, error } =
    rpcParams === undefined ? await analyticsSchema().rpc(fn) : await analyticsSchema().rpc(fn, rpcParams);
  if (error) {
    const kind = classify(error.code, error.message ?? "");
    throw new AnalyticsRpcError(
      kind,
      MESSAGES[kind],
      `${fn}: ${error.code ?? "?"} ${error.message ?? ""}${
        error.details ? ` | details: ${error.details}` : ""
      }${error.hint ? ` | hint: ${error.hint}` : ""}`,
      error.code ?? null,
      error.hint ?? null,
    );
  }
  return data as AnalyticsFunctionReturns<Name>;
}

export const isDev = import.meta.env.DEV;