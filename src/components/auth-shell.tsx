import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Typographic wordmark — no illustration, no badge. */
export function CashHoldingsMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "font-sans text-[12px] tracking-[0.06em] leading-none text-foreground",
        className
      )}
    >
      CASH HOLDINGS
    </div>
  );
}

/**
 * Single centered authentication card on the obsidian canvas.
 * Logo · Welcome back · fields · action. Nothing else.
 */
export function AuthShell({
  subtitle,
  children,
  heading = "Welcome back",
}: {
  subtitle?: ReactNode;
  children: ReactNode;
  heading?: string;
}) {
  return (
    <div className="min-h-screen grid place-items-center px-5 py-14">
      {/* environmental light source */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(760px 420px at 50% -8%, var(--glow-1), transparent 68%)",
        }}
        aria-hidden
      />
      <main className="w-full max-w-[360px] ch-scale-in">
        <div className="surface-raised rounded-[18px] px-7 py-9">
          <div className="flex flex-col items-center text-center">
            <CashHoldingsMark />
            <h1 className="text-title mt-6">{heading}</h1>
            {subtitle && <p className="text-supporting mt-2">{subtitle}</p>}
          </div>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function AuthNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "text-[11.5px] leading-snug",
        tone === "error" ? "text-danger" : "text-muted-foreground"
      )}
    >
      {children}
    </div>
  );
}

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mono-label !text-[8.5px]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const authInputClass =
  "h-11 w-full rounded-[10px] bg-[var(--surface-1)] border border-edge px-3.5 text-[13.5px] text-foreground placeholder:text-muted-foreground/50 motion-micro focus:outline-none focus:border-teal/55 focus:ring-1 focus:ring-teal/25";

export const authButtonClass =
  "h-11 w-full rounded-[10px] bg-foreground text-background text-[13.5px] font-medium motion-micro hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

export const authQuietClass =
  "w-full text-center text-[12px] text-muted-foreground hover:text-foreground motion-micro";

/** Plain-language messages — never expose backend or provider wording. */
export function humanAuthError(raw?: string | null): string {
  const m = (raw ?? "").toLowerCase();
  if (!m) return "Something went wrong. Try again.";
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Those credentials don't match an account.";
  if (m.includes("email not confirmed")) return "This account isn't active yet.";
  if (m.includes("rate") || m.includes("too many"))
    return "Too many attempts. Wait a moment and try again.";
  if (m.includes("network") || m.includes("fetch"))
    return "Can't reach the network right now. Check your connection.";
  if (m.includes("password") && m.includes("short"))
    return "Use at least 8 characters for your password.";
  if (m.includes("expired") || m.includes("invalid token"))
    return "This link is no longer valid. Request a new one.";
  return "Something went wrong. Try again.";
}
