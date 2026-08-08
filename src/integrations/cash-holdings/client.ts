import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_CASH_SUPABASE_URL as string;
const key = import.meta.env.VITE_CASH_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  // Surface a clear error rather than silently falling back.
  // eslint-disable-next-line no-console
  console.error(
    '[cash-holdings] Missing VITE_CASH_SUPABASE_URL / VITE_CASH_SUPABASE_PUBLISHABLE_KEY'
  );
}

export const cashHoldingsSupabase = createClient(url, key, {
  auth: {
    storageKey: 'cash-holdings-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
