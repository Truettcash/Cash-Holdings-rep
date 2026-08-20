import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";

/**
 * TEMPORARY development/preview-only control for the Phase 4A OpenJarvis proof.
 * Copies the current session access token straight to the clipboard.
 * Never renders, logs, or stores the token. Remove after the proof completes.
 */
export function McpTokenCopy() {
  const [busy, setBusy] = useState(false);

  if (import.meta.env.PROD) return null;

  const copy = async () => {
    setBusy(true);
    try {
      const { data } = await cashHoldingsSupabase.auth.getSession();
      const token = data.session?.access_token;
      if (!data.session || !token) {
        toast.error("No authenticated Cash Holdings session found.");
        return;
      }
      try {
        await navigator.clipboard.writeText(token);
      } catch {
        toast.error("Clipboard access failed.");
        return;
      }
      toast.success(
        "Access token copied securely. Paste it into the hidden Codespace terminal prompt."
      );
    } catch {
      toast.error("No authenticated Cash Holdings session found.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <div className="min-w-0">
        <div className="text-[12.5px]">Cash MCP access token</div>
        <div className="mono-label !text-[9px] text-muted-foreground mt-1">
          PREVIEW ONLY · TEMPORARY
        </div>
      </div>
      <button
        onClick={copy}
        disabled={busy}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-[11px] font-sans tracking-wider hover:border-teal hover:text-teal transition-colors disabled:opacity-40"
      >
        <KeyRound className="h-3 w-3" />
        {busy ? "COPYING…" : "COPY CASH MCP ACCESS TOKEN"}
      </button>
    </div>
  );
}
