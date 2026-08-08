import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

type ConnectStartResponse = {
  authorization_url?: string;
  error?: string;
};

async function resolveYoutubeChannelId(brandKey: string | null): Promise<string> {
  if (!brandKey) {
    throw new Error("Brand key is required to start YouTube connect.");
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
    throw new Error("Brand not found for YouTube connect.");
  }

  const { data: channel, error: channelError } = await cashHoldingsSupabase
    .from("channels")
    .select("id")
    .eq("brand_id", brandId)
    .eq("provider", "youtube")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (channelError) throw channelError;

  if (!channel?.id) {
    throw new Error("No active YouTube channel is configured for this brand.");
  }

  return channel.id;
}

async function connectStart(channelId: string) {
  const { data, error } = await cashHoldingsSupabase.functions.invoke<ConnectStartResponse>(
    "integrations/connect/youtube/start",
    {
      body: { channel_id: channelId },
    },
  );
  if (error) throw error;

  const authorizationUrl = typeof data?.authorization_url === "string"
    ? data.authorization_url
    : null;
  if (!authorizationUrl) {
    throw new Error("YouTube connect did not return authorization_url.");
  }

  return { authorizationUrl, channelId };
}

export const youtube = {
  /** Starts deployed YouTube OAuth using POST /connect/youtube/start with channel_id. */
  connect: async (brandKey: string | null) => {
    const channelId = await resolveYoutubeChannelId(brandKey);
    return connectStart(channelId);
  },
};
