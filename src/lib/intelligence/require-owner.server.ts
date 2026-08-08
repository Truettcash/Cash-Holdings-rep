import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Verifies the caller's Cash Holdings session server-side. Throws a 401
 * Response when the request has no valid bearer token. Fails closed.
 */
export async function requireCashHoldingsUser(): Promise<{ id: string }> {
  const unauthorized = () => new Response("Unauthorized", { status: 401 });

  const authHeader = getRequestHeader("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) throw unauthorized();
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) throw unauthorized();

  const url =
    process.env["CASH_SUPABASE_URL"] ?? import.meta.env.VITE_CASH_SUPABASE_URL;
  const key =
    process.env["CASH_SUPABASE_PUBLISHABLE_KEY"] ??
    import.meta.env.VITE_CASH_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw unauthorized();

  const supabase = createClient(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw unauthorized();
  return { id: data.user.id };
}