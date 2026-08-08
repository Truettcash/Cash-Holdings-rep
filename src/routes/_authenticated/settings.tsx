import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import { useSession } from "@/lib/use-session";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = useSession();
  return (
    <div>
      <PageHeader eyebrow="System" title="Settings" subtitle="Operator account and session." />
      <div className="max-w-xl space-y-4">
        <Panel title="Operator">
          <dl className="grid grid-cols-3 gap-y-3 text-[13px]">
            <dt className="mono-label col-span-1">Email</dt>
            <dd className="col-span-2 font-sans text-[12.5px]">{session?.user.email ?? "—"}</dd>
            <dt className="mono-label col-span-1">Signed in</dt>
            <dd className="col-span-2 font-sans text-[12.5px]">
              {session?.user.last_sign_in_at
                ? new Date(session.user.last_sign_in_at).toLocaleString()
                : "—"}
            </dd>
          </dl>
        </Panel>
        <Panel title="Appearance">
          <p className="text-[13px] text-muted-foreground mb-3">
            Choose light, dark, or follow your device. Your choice is remembered on this browser.
          </p>
          <ThemeToggle showLabels />
        </Panel>
        <Panel title="Session">
          <Button
            variant="outline"
            className="border-hairline bg-transparent hover:bg-accent"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </Button>
        </Panel>
        <Panel title="About">
          <p className="text-[13px] text-muted-foreground">
            Cash Holdings is a private operating system. No external visitors, no public surface.
          </p>
        </Panel>
      </div>
    </div>
  );
}
