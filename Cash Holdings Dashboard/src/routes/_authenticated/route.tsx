import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Search, Menu } from "lucide-react";
import { cashHoldingsSupabase as supabase } from "@/integrations/cash-holdings/client";
import { AppSidebar } from "@/components/app-sidebar";
import { q } from "@/lib/data";
import { useSession } from "@/lib/use-session";
import { AddButton, AddDrawerHost, AddFab } from "@/components/add-drawer";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell, NotificationsPanel } from "@/components/notifications-center";
import { AppProvider, useApp } from "@/lib/app-context";
import { BottomNav } from "@/components/bottom-nav";
import { JarvisProvider } from "@/lib/jarvis/context";
import { JarvisLauncher, JarvisSurface } from "@/components/jarvis/jarvis-surface";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/lib/theme";
import { ANALYTICS_ROOT } from "@/lib/analytics/keys";

/** Bumped when the backend's analytics exposure changes; drops pre-exposure failures. */
const ANALYTICS_EXPOSURE_STAMP = "2026-08-02-analytics-exposed";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { userEmail: data.session.user.email ?? null };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppProvider>
      <JarvisProvider>
        <AuthedShell />
        <CommandPalette />
        <NotificationsPanel />
        <AddDrawerHost />
        <JarvisLauncher />
        <JarvisSurface />
      </JarvisProvider>
    </AppProvider>
  );
}

function AuthedShell() {
  const { session } = useSession();
  const { resolved } = useTheme();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // One-time purge of analytics results cached before the schema was exposed
  // (PGRST106 / PGRST202 era), so no module keeps degrading on stale failures.
  useEffect(() => {
    try {
      if (localStorage.getItem("ch.analyticsExposure") === ANALYTICS_EXPOSURE_STAMP) return;
      localStorage.setItem("ch.analyticsExposure", ANALYTICS_EXPOSURE_STAMP);
    } catch {
      /* no-op */
    }
    qc.removeQueries({ queryKey: ANALYTICS_ROOT });
    qc.invalidateQueries({ queryKey: ANALYTICS_ROOT });
  }, [qc]);
  // Presentation-only marker so the sign-in screen can explain a lapsed session.
  useEffect(() => {
    if (!session) return;
    try {
      sessionStorage.setItem("ch.hadSession", "1");
    } catch {
      /* no-op */
    }
  }, [session]);
  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: q.brands,
    staleTime: 60_000,
  });
  const { brandFilter, setBrandFilter, setPaletteOpen, setMobileNavOpen } = useApp();

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <AppSidebar brands={brands} userEmail={session?.user.email} />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-30 edge-b chrome-blur">
          <div className="flex items-center justify-between px-4 sm:px-7 h-14 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden h-8 w-8 -ml-1 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="mono-label !text-[8.5px] !text-muted-foreground/60 truncate">
                {breadcrumbFor(path)}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-[9px] border border-transparent bg-[var(--surface-2)] text-muted-foreground hover:text-foreground motion-micro text-[12px]"
                aria-label="Search"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="ml-3 mono-label !text-[8.5px] rounded px-1">⌘K</kbd>
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="md:hidden h-8 w-8 grid place-items-center rounded-[9px] bg-[var(--surface-2)] text-muted-foreground motion-micro"
                aria-label="Search"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <NotificationBell />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="h-8 max-w-[140px] sm:max-w-none px-2 rounded-[9px] border border-transparent bg-[var(--surface-2)] text-[11px] font-sans tracking-[0.01em] focus:outline-none truncate motion-micro"
                aria-label="Global brand filter"
              >
                <option value="all">ALL HOLDINGS</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <span className="hidden sm:inline-flex"><AddButton /></span>
            </div>
          </div>
        </div>
        <main className="flex-1 min-w-0 px-4 sm:px-7 py-6 pb-28 md:pb-8 w-full max-w-[1680px]">
          <div key={path} className="ch-page-in">
            <Outlet />
          </div>
        </main>
        {/* Mobile floating + ADD */}
        <AddFab />
        <BottomNav />
        <Toaster position="bottom-right" theme={resolved} />
      </div>
    </div>
  );
}

function breadcrumbFor(path: string): string {
  if (path === "/") return "MORNING BRIEF";
  const seg = path.split("/").filter(Boolean);
  return seg.map((s) => s.replace(/-/g, " ").toUpperCase()).join(" / ");
}
