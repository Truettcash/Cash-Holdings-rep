import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

/**
 * Browser surface for the `ebay-integrations` Edge Function.
 * OAuth, token storage, refresh and every eBay API call stay server-side —
 * the browser only ever receives token-free status objects.
 */

export const EBAY_PRIMARY_BRAND_KEY = "throttle-kings";

export type EbayCursors = {
  orders_modified_from?: string | null;
  returns_modified_from?: string | null;
  listings_synced_at?: string | null;
} | null;

export type EbayStatus = {
  provider: "ebay";
  connected: boolean;
  accountName: string | null;
  accountUsername: string | null;
  accountType?: string | null;
  brandKey?: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  lastError: string | null;
  cursors?: EbayCursors;
  environment?: "sandbox" | "production";
  redirectUri?: string;
  received?: number;
  written?: number;
};

type Action = "connect" | "status" | "sync" | "disconnect";

async function invoke<T>(action: Action, brandKey: string | null, extra: Record<string, unknown> = {}) {
  const { data, error } = await cashHoldingsSupabase.functions.invoke<T>("ebay-integrations", {
    body: { action, brandKey, ...extra },
  });
  if (error) throw error;
  if (!data) throw new Error(`No response from ebay-integrations.${action}`);
  return data;
}

export const ebay = {
  /** Returns the eBay authorization URL; the caller navigates to it. */
  connect: (brandKey: string | null) =>
    invoke<{ authorizationUrl: string; redirectUri: string; ruName: string; expiresAt: string }>(
      "connect",
      brandKey,
      { returnOrigin: window.location.origin },
    ),
  status: (brandKey: string | null) => invoke<EbayStatus>("status", brandKey),
  sync: (brandKey: string | null) => invoke<EbayStatus>("sync", brandKey),
  disconnect: (brandKey: string | null) => invoke<EbayStatus>("disconnect", brandKey),
};

export const ebayStatusQuery = (brandKey: string | null) =>
  queryOptions({
    queryKey: ["ebay-status", brandKey ?? EBAY_PRIMARY_BRAND_KEY] as const,
    queryFn: () => ebay.status(brandKey ?? EBAY_PRIMARY_BRAND_KEY),
    retry: false,
  });