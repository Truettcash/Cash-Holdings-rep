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
 * Wiring check for the shared connector: confirms the function is reachable and
 * reports which server-side variables are still unset. Returns names only —
 * never values.
 */
export async function connectorHealth(): Promise<ConnectorHealth> {
  return invoke<ConnectorHealth>("health", "youtube");
}