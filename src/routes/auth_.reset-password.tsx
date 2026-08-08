import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import {
  AuthShell,
  AuthField,
  AuthNotice,
  authInputClass,
  authButtonClass,
  authQuietClass,
  humanAuthError,
} from "@/components/auth-shell";

export const Route = createFileRoute("/auth_/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Password — Cash Holdings" },
      {
        name: "description",
        content: "Set a new password for your Cash Holdings operator account.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Reset Password — Cash Holdings" },
      {
        property: "og:description",
        content: "Set a new password for your Cash Holdings operator account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery link puts a session in the URL; detectSessionInUrl consumes it.
  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setRecovery(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setRecovery(Boolean(data.session));
      setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(humanAuthError(error.message));
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate({ to: "/auth" }), 1400);
  }

  return (
    <AuthShell
      heading="New password"
      subtitle={ready && recovery ? "Choose something only you know." : undefined}
    >
      {!ready ? (
        <div className="text-center text-[12.5px] text-muted-foreground py-2">
          Verifying your link…
        </div>
      ) : done ? (
        <div className="text-center space-y-1.5 py-1">
          <div className="text-[13px]">Password updated.</div>
          <div className="mono-label !text-[8.5px]">Returning to sign in…</div>
        </div>
      ) : !recovery ? (
        <div className="space-y-4 text-center">
          <AuthNotice>This link is no longer valid. Request a new one from sign in.</AuthNotice>
          <button onClick={() => navigate({ to: "/auth" })} className={authQuietClass}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField label="New password">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
              autoFocus
            />
          </AuthField>
          <AuthField label="Confirm password">
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
              autoComplete="new-password"
            />
          </AuthField>
          {error && <AuthNotice tone="error">{error}</AuthNotice>}
          <button type="submit" disabled={busy} className={authButtonClass}>
            {busy ? "Updating…" : "Continue"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
