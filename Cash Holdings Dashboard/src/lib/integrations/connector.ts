import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import type {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationSyncResult,
} from "./types";

/**
 * Single connector surface for every provider: connect / callback / status /
 * sync / refresh / disconnect. All provider credentials and OAuth exchanges
 * live in the `integrations` Edge Function — this module only ever sees
 * token-free status objects.
 *
 * `callback` is intentionally not a client action: the provider redirects the
 * browser straight to the Edge Function, which completes the exchange
 * server-side and redirects back to the dashboard.
 */

type ConnectorAction = "connect" | "status" | "sync" | "refresh" | "disconnect" | "health";

/** Path-routed connector service on the Cash Holdings project. */
export const CONNECTOR_BASE_URL = `${import.meta.env.VITE_CASH_SUPABASE_URL as string}/functions/v1/integrations`;
export const CASH_PUBLISHABLE_KEY = import.meta.env
  .VITE_CASH_SUPABASE_PUBLISHABLE_KEY as string;

async function invoke<T>(
  action: ConnectorAction,
  provider: IntegrationProvider,
  brandKey: string | null = null,
): Promise<T> {
  const { data, error } = await cashHoldingsSupabase.functions.invoke<T>("integrations", {
    body: { action, provider, brandKey },
  });
  if (error) throw error;
  if (!data) throw new Error(`No response from integrations.${action}`);
  return data;
}

export const integrationConnector = {
  /** Returns the provider authorization URL; the caller navigates to it. */
  connect: (provider: IntegrationProvider, brandKey: string | null = null) =>
    invoke<{ authorizationUrl: string }>("connect", provider, brandKey),

  status: (provider: IntegrationProvider, brandKey: string | null = null) =>
    invoke<IntegrationStatus>("status", provider, brandKey),

  sync: (provider: IntegrationProvider, brandKey: string | null = null) =>
    invoke<IntegrationSyncResult>("sync", provider, brandKey),

  refresh: (provider: IntegrationProvider, brandKey: string | null = null) =>
    invoke<IntegrationStatus>("refresh", provider, brandKey),

  disconnect: (provider: IntegrationProvider, brandKey: string | null = null) =>
    invoke<IntegrationStatus>("disconnect", provider, brandKey),
};

export type ConnectorHealth = {
  ok: boolean;
  missingEnv: string[];
  providers: string[];
};

/**
 * Wiring check for the shared connector. The deployed connector is path-routed,
 * so this is a real GET to `/functions/v1/integrations/health` — `functions.invoke`
 * cannot express that (it always POSTs to the function root).
 *
 * Returns names only — never values.
 */
export async function connectorHealth(): Promise<ConnectorHealth> {
  const { data } = await cashHoldingsSupabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const res = await fetch(`${CONNECTOR_BASE_URL}/health`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: CASH_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Connector health failed [${res.status}]: ${body}`);
  }

  const payload = (await res.json()) as Partial<ConnectorHealth> | null;
  return {
    ok: payload?.ok === true,
    missingEnv: Array.isArray(payload?.missingEnv) ? payload.missingEnv : [],
    providers: Array.isArray(payload?.providers) ? payload.providers : [],
  };
}