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

type ConnectStartResponse = {
  authorization_url?: string;
  error?: string;
};

async function resolveInstagramChannelId(brandKey: string | null): Promise<string> {
  if (!brandKey) {
    throw new Error("Brand key is required to start Instagram connect.");
  }

  const { data: slugMatch, error: slugError } = await cashHoldingsSupabase
    .from("brands")
    .select("id")
    .eq("slug", brandKey)
    .maybeSingle();
  if (slugError) throw slugError;

  let brandId = slugMatch?.id ?? null;
  if (!brandId) {
    const { data: keyMatch, error: keyError } = await cashHoldingsSupabase
      .from("brands")
      .select("id")
      .eq("key", brandKey)
      .maybeSingle();
    if (keyError) throw keyError;
    brandId = keyMatch?.id ?? null;
  }

  if (!brandId) {
    throw new Error("Brand not found for Instagram connect.");
  }

  const { data: channel, error: channelError } = await cashHoldingsSupabase
    .from("channels")
    .select("id")
    .eq("brand_id", brandId)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (channelError) throw channelError;

  if (!channel?.id) {
    throw new Error("No active Instagram channel is configured for this brand.");
  }

  return channel.id;
}

async function connectStart(channelId: string) {
  const { data, error } = await cashHoldingsSupabase.functions.invoke<ConnectStartResponse>(
    "instagram-integrations/connect/start",
    {
      body: { channel_id: channelId },
    },
  );
  if (error) throw error;

  const authorizationUrl = typeof data?.authorization_url === "string"
    ? data.authorization_url
    : null;
  if (!authorizationUrl) {
    throw new Error("Instagram connect did not return authorization_url.");
  }

  return { authorizationUrl, channelId };
}

export const instagram = {
  /** Starts deployed Instagram OAuth using POST /connect/start with channel_id. */
  connect: async (brandKey: string | null) => {
    const channelId = await resolveInstagramChannelId(brandKey);
    return connectStart(channelId);
  },
};

export const instagramStatusQuery = (brandKey: string | null) =>
  queryOptions({
    queryKey: ["instagram-status", brandKey ?? "all"] as const,
    queryFn: async () => {
      throw new Error("Instagram status mutation endpoint is not available in production.");
    },
    retry: false,
  });