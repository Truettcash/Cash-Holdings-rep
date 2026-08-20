import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import {
  AuthShell,
  AuthField,
  AuthNotice,
  authInputClass,
  authButtonClass,
  authQuietClass,
} from "@/components/auth-shell";
import { humanAuthError } from "@/components/auth-shell";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

const HAD_SESSION = "ch.hadSession";
type Mode = "signin" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [expired, setExpired] = useState(false);

  // Presentation-only: if this browser previously held a session, the visit to
  // the sign-in screen means it lapsed. No auth logic is involved.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(HAD_SESSION) === "1") {
        setExpired(true);
        sessionStorage.removeItem(HAD_SESSION);
      }
    } catch {
      /* no-op */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(humanAuthError(error.message));
      return;
    }
    try {
      sessionStorage.setItem(HAD_SESSION, "1");
    } catch {
      /* no-op */
    }
    navigate({ to: "/" });
  }

  // Neutral response regardless of whether the address exists — no enumeration.
  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setBusy(false);
    setResetSent(true);
  }

  if (mode === "forgot") {
    return (
      <AuthShell heading="Reset password" subtitle="We'll email you a secure link.">
        {resetSent ? (
          <div className="space-y-5 text-center">
            <AuthNotice>If that address has an account, a reset link is on its way.</AuthNotice>
            <button
              type="button"
              className={authQuietClass}
              onClick={() => {
                setResetSent(false);
                setMode("signin");
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={requestReset} className="space-y-4">
            <AuthField label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClass}
                autoComplete="email"
                autoFocus
              />
            </AuthField>
            {error && <AuthNotice tone="error">{error}</AuthNotice>}
            <button type="submit" disabled={busy} className={authButtonClass}>
              {busy ? "Sending" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={authQuietClass}
            >
              Back to sign in
            </button>
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        {expired && <AuthNotice>Session ended. Sign in to continue.</AuthNotice>}
        <AuthField label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            autoComplete="email"
            autoFocus
          />
        </AuthField>
        <AuthField label="Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
            autoComplete="current-password"
          />
        </AuthField>
        {error && <AuthNotice tone="error">{error}</AuthNotice>}
        <button type="submit" disabled={busy} className={authButtonClass}>
          {busy ? "Signing in" : "Continue"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("forgot");
            setError(null);
          }}
          className={authQuietClass}
        >
          Forgot password?
        </button>
      </form>
    </AuthShell>
  );
}
