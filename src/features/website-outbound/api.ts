// API helpers for website-outbound feature
import { queryClient } from '../../lib/query-client';

export async function dryRunImport(payload: unknown) {
  // placeholder: implement fetch to backend RPC or API route
  return Promise.resolve(null);
}

export async function runProductionImport(payload: unknown) {
  // placeholder: trigger production import (must be gated)
  return Promise.resolve(null);
}

export default { dryRunImport, runProductionImport };
