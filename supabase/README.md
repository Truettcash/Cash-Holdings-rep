# Supabase Lineage Notes

- `supabase/migrations/20260808_001_website_outbound_idempotency.sql` restores source-control lineage for an already-applied production change.
- The two website-outbound idempotency indexes were independently verified as already present in production before this file was recovered here.
- This repository history recovery does not authorize rerunning production migration state blindly; production schema changes still require explicit review and environment-aware execution.