import { createMiddleware } from "@tanstack/react-start";

import { cashHoldingsSupabase } from "./client";

/**
 * Attaches the Cash Holdings (external project) bearer token to every server
 * function RPC so handlers can verify the caller server-side.
 */
export const attachCashHoldingsAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await cashHoldingsSupabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);