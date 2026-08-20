import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

/**
 * Browser surface for the `instagram-integrations` Edge Function.
 * Every credential and token exchange stays inside the function — the browser
 * only ever receives token-free status objects.
 */

export type InstagramStatus = {
  provider: "instagram";
  connected: boolean;
  accountName: string | null;
  accountUsername: string | null;
  accountType?: string | null;
  brandKey?: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  lastError: string | null;
  redirectUri?: string;
  received?: number;
  written?: number;
};

type Action = "connect" | "status" | "sync" | "disconnect";

async function invoke<T>(action: Action, brandKey: string | null, extra: Record<string, unknown> = {}) {
  const { data, error } = await cashHoldingsSupabase.functions.invoke<T>("instagram-integrations", {
    body: { action, brandKey, ...extra },
  });
  if (error) throw error;
  if (!data) throw new Error(`No response from instagram-integrations.${action}`);
  return data;
}

export const instagram = {
  /** Returns the Instagram authorization URL; the caller navigates to it. */
  connect: (brandKey: string | null) =>
    invoke<{ authorizationUrl: string; redirectUri: string; expiresAt: string }>("connect", brandKey, {
      returnOrigin: window.location.origin,
    }),
  status: (brandKey: string | null) => invoke<InstagramStatus>("status", brandKey),
  sync: (brandKey: string | null) => invoke<InstagramStatus>("sync", brandKey),
  disconnect: (brandKey: string | null) => invoke<InstagramStatus>("disconnect", brandKey),
};

export const instagramStatusQuery = (brandKey: string | null) =>
  queryOptions({
    queryKey: ["instagram-status", brandKey ?? "all"] as const,
    queryFn: () => instagram.status(brandKey),
    retry: false,
  });