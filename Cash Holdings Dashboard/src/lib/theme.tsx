/**
 * Appearance system — dark | light | system, persisted locally.
 * The resolved mode is applied as a class on <html> so every token, chart,
 * dialog and navigation surface follows it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "ch.appearance";

/** Runs before hydration in <head> so there is never a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var p=localStorage.getItem(k)||"dark";var m=p==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(m==="light"?"light":"dark");r.style.colorScheme=m;}catch(e){document.documentElement.classList.add("dark");}})();`;

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "dark";
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

type Ctx = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  // Hydrate from storage after mount (SSR has no localStorage).
  useEffect(() => {
    const p = readPreference();
    const r = p === "system" ? systemTheme() : p;
    setPreferenceState(p);
    setResolved(r);
    apply(r);
  }, []);

  // Follow the OS when the preference is "system".
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r = systemTheme();
      setResolved(r);
      apply(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* storage unavailable — session-only preference */
    }
    const r = p === "system" ? systemTheme() : p;
    setResolved(r);
    apply(r);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    return { preference: "dark", resolved: "dark", setPreference: () => {} };
  }
  return ctx;
}
