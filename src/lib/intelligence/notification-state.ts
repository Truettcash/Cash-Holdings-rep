import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

/**
 * Interaction state only (read / archived) for derived notifications.
 * Table: public.notification_state — see db/notification-state.sql.
 * When the table has not been created yet, everything degrades to local state.
 */
export type NotificationStateRow = {
  notification_key: string;
  read_at: string | null;
  archived_at: string | null;
};

export type NotificationStateMap = {
  available: boolean;
  byKey: Record<string, { read: boolean; archived: boolean }>;
};

const LOCAL_KEY = "ch.notifications.state";

function readLocal(): Record<string, { read: boolean; archived: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocal(map: Record<string, { read: boolean; archived: boolean }>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
  } catch {
    /* no-op */
  }
}

const table = () => cashHoldingsSupabase.from("notification_state") as any;

/** Missing table / missing grant → fall back rather than surfacing an error. */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42501" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("permission denied") ||
    msg.includes("schema cache")
  );
}

export const notificationStateQuery = () =>
  queryOptions({
    queryKey: ["notification-state"] as const,
    queryFn: async (): Promise<NotificationStateMap> => {
      const { data, error } = await table().select("notification_key, read_at, archived_at");
      if (error) {
        if (isMissingTable(error)) return { available: false, byKey: readLocal() };
        throw error;
      }
      const byKey: NotificationStateMap["byKey"] = {};
      for (const row of (data ?? []) as NotificationStateRow[]) {
        byKey[row.notification_key] = {
          read: Boolean(row.read_at),
          archived: Boolean(row.archived_at),
        };
      }
      return { available: true, byKey };
    },
    staleTime: 30_000,
  });

async function upsert(keys: string[], patch: { read_at?: string | null; archived_at?: string | null }) {
  if (keys.length === 0) return { available: true };
  const { data: userData } = await cashHoldingsSupabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("No active session");

  const rows = keys.map((notification_key) => ({
    user_id: userId,
    notification_key,
    ...patch,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await table().upsert(rows, { onConflict: "user_id,notification_key" });
  if (error) {
    if (isMissingTable(error)) {
      const local = readLocal();
      for (const key of keys) {
        local[key] = {
          read: patch.read_at !== undefined ? Boolean(patch.read_at) : local[key]?.read ?? false,
          archived:
            patch.archived_at !== undefined
              ? Boolean(patch.archived_at)
              : local[key]?.archived ?? false,
        };
      }
      writeLocal(local);
      return { available: false };
    }
    throw error;
  }
  return { available: true };
}

export const notificationMutations = {
  markRead: (keys: string[]) => upsert(keys, { read_at: new Date().toISOString() }),
  markUnread: (keys: string[]) => upsert(keys, { read_at: null }),
  archive: (keys: string[]) =>
    upsert(keys, { read_at: new Date().toISOString(), archived_at: new Date().toISOString() }),
  unarchive: (keys: string[]) => upsert(keys, { archived_at: null }),
};