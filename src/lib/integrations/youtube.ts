import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

type ConnectStartResponse = {
  authorization_url?: string;
  error?: string;
};

type ConfirmYouTubeConnectResponse = {
  ok?: boolean;
  error?: string;
  connection?: {
    id: string;
    channel_id: string;
    provider: string;
    connection_status: string;
    sync_enabled: boolean;
    provider_external_account_id: string | null;
    granted_scopes: string[];
    provider_metadata: Record<string, unknown>;
  };
};

function requireHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("YouTube connect returned an invalid authorization URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("YouTube connect returned an unsupported authorization URL.");
  }

  return parsed.toString();
}

async function connectStart(channelId: string) {
  const {
    data: { session },
    error: sessionError,
  } = await cashHoldingsSupabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("You must be signed in to connect YouTube.");
  }

  const { data, error } = await cashHoldingsSupabase.functions.invoke<ConnectStartResponse>(
    "integrations/connect/youtube/start",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: { channel_id: channelId },
    },
  );
  if (error) throw error;

  const authorizationUrl = typeof data?.authorization_url === "string"
    ? requireHttpUrl(data.authorization_url)
    : null;
  if (!authorizationUrl) {
    throw new Error("YouTube connect did not return authorization_url.");
  }

  return { authorizationUrl, channelId };
}

async function confirmYouTubeConnect(channelId: string) {
  const {
    data: { session },
    error: sessionError,
  } = await cashHoldingsSupabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("You must be signed in to confirm YouTube connection.");
  }

  const supabaseUrl = import.meta.env.VITE_CASH_SUPABASE_URL as string;
  const supabasePublishableKey = import.meta.env.VITE_CASH_SUPABASE_PUBLISHABLE_KEY as string;
  if (!supabaseUrl) {
    throw new Error("Missing VITE_CASH_SUPABASE_URL.");
  }

  const resp = await fetch(
    `${supabaseUrl}/functions/v1/integrations/connect/youtube/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel_id: channelId }),
    },
  );

  const data = (await resp.json().catch(() => null)) as ConfirmYouTubeConnectResponse | null;

  if (!resp.ok) {
    throw new Error(data?.error ?? "YouTube confirmation failed.");
  }

  if (!data?.ok || !data.connection) {
    throw new Error("YouTube confirmation returned an invalid response.");
  }

  return data.connection;
}

export const youtube = {
  /** Starts deployed YouTube OAuth using POST /connect/youtube/start with channel_id. */
  connect: (channelId: string) => connectStart(channelId),
  confirmYouTubeConnect: (channelId: string) => confirmYouTubeConnect(channelId),
};
