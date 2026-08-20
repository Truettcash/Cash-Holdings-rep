import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { CASH_PUBLISHABLE_KEY, CONNECTOR_BASE_URL } from "./connector";

/**
 * YouTube uses the provider-specific path on the deployed connector:
 *   POST /functions/v1/integrations/connect/youtube/start
 * with the caller's Cash Holdings bearer token and a real `channels.id`.
 *
 * The generic root-action contract is NOT used here — production does not
 * implement it. Status is read from the authenticated integration read model,
 * and sync/refresh/disconnect are not exposed for YouTube.
 */
export async function startYouTubeConnect(channelId: string): Promise<string> {
  if (!channelId) throw new Error("Select a YouTube channel first.");

  const { data } = await cashHoldingsSupabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Your session expired. Sign in again before connecting YouTube.");
  }

  const res = await fetch(`${CONNECTOR_BASE_URL}/connect/youtube/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: CASH_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel_id: channelId }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`YouTube connect failed [${res.status}]: ${text}`);
  }

  let payload: { ok?: boolean; authorization_url?: string; error?: string; message?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`YouTube connect returned an unreadable response: ${text}`);
  }

  if (payload.ok !== true) {
    throw new Error(payload.message ?? payload.error ?? "YouTube connect was rejected.");
  }

  const url = payload.authorization_url;
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("YouTube connect did not return a valid authorization URL.");
  }
  return url;
}
