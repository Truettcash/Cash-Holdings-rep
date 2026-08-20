import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

const BRAND_SCOPE_KEY = "ch.brandScope";

type Mode = "task" | "project" | "activity" | "metric" | "org" | "contact" | "deal";

type Ctx = {
  brandFilter: string; // "all" or brand id
  setBrandFilter: (v: string) => void;
  addOpen: boolean;
  addMode: Mode;
  addPrefill: { brand_id?: string; project_id?: string; organization_id?: string };
  openAdd: (mode?: Mode, prefill?: Ctx["addPrefill"]) => void;
  closeAdd: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [brandFilter, setBrandFilterState] = useState<string>("all");
  // Scope is the primary control surface, so it survives reloads and navigation.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRAND_SCOPE_KEY);
      if (saved) setBrandFilterState(saved);
    } catch {
      /* no-op */
    }
  }, []);
  const setBrandFilter = useCallback((v: string) => {
    setBrandFilterState(v);
    try {
      localStorage.setItem(BRAND_SCOPE_KEY, v);
    } catch {
      /* no-op */
    }
  }, []);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<Mode>("task");
  const [addPrefill, setAddPrefill] = useState<Ctx["addPrefill"]>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openAdd = useCallback((mode: Mode = "task", prefill: Ctx["addPrefill"] = {}) => {
    setAddMode(mode);
    setAddPrefill(prefill);
    setAddOpen(true);
  }, []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  return (
    <AppCtx.Provider
      value={{
        brandFilter,
        setBrandFilter,
        addOpen,
        addMode,
        addPrefill,
        openAdd,
        closeAdd,
        paletteOpen,
        setPaletteOpen,
        notificationsOpen,
        setNotificationsOpen,
        mobileNavOpen,
        setMobileNavOpen,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}