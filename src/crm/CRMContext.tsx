import React, { createContext, useContext, useMemo, useState } from 'react';

export type Filters = {
  tier?: string | null;
  brand?: string | null;
  status?: string | null;
  pipelineStage?: string | null;
  phoneReview?: 'approved' | 'rejected' | 'any' | null;
};

export type Sorts = {
  fitScore?: 'asc' | 'desc' | null;
  queueScore?: 'asc' | 'desc' | null;
};

export type ColumnVisibility = Record<string, boolean>;

export type SavedView = {
  id: string;
  name: string;
  filters: Filters;
  sorts: Sorts;
  columns?: ColumnVisibility;
};

type CRMContextType = {
  query: string;
  setQuery: (q: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  sorts: Sorts;
  setSorts: (s: Sorts) => void;
  columns: ColumnVisibility;
  setColumns: (c: ColumnVisibility) => void;
  savedViews: SavedView[];
  saveView: (v: SavedView) => void;
  loadView: (id: string) => void;
  selectedId?: string | number;
  selectRow: (id?: string | number) => void;
};

const CRMContext = createContext<CRMContextType | null>(null);

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sorts, setSorts] = useState<Sorts>({});
  const DEFAULT_COLUMNS: ColumnVisibility = {
    name: true,
    email: true,
    phone: true,
    createdAt: true,
  };
  const [columns, _setColumns] = useState<ColumnVisibility>(() => {
    try {
      const raw = localStorage.getItem('crm:columns');
      return raw ? (JSON.parse(raw) as ColumnVisibility) : DEFAULT_COLUMNS;
    } catch (e) {
      return DEFAULT_COLUMNS;
    }
  });

  const setColumns = (c: ColumnVisibility) => {
    _setColumns(c);
    try {
      localStorage.setItem('crm:columns', JSON.stringify(c));
    } catch (e) {
      // ignore
    }
  };
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try {
      const raw = localStorage.getItem('crm:savedViews');
      return raw ? (JSON.parse(raw) as SavedView[]) : [];
    } catch (e) {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState<string | number | undefined>(undefined);

  const saveView = (v: SavedView) => {
    setSavedViews((prev) => {
      const idx = prev.findIndex((x) => x.id === v.id);
      let next: SavedView[];
      if (idx >= 0) {
        next = [...prev.slice(0, idx), v, ...prev.slice(idx + 1)];
      } else {
        next = [...prev, v];
      }
      try {
        localStorage.setItem('crm:savedViews', JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  const loadView = (id: string) => {
    const v = savedViews.find((x) => x.id === id);
    if (v) {
      setFilters(v.filters);
      setSorts(v.sorts);
      if (v.columns) setColumns(v.columns);
    }
  };

  const deleteView = (id: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((x) => x.id !== id);
      try {
        localStorage.setItem('crm:savedViews', JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  const selectRow = (id?: string | number) => setSelectedId(id);

  const value = useMemo(
    () => ({
      query,
      setQuery,
      filters,
      setFilters,
      sorts,
      setSorts,
      columns,
      setColumns,
      savedViews,
      saveView,
      loadView,
      deleteView,
      selectedId,
      selectRow,
    }),
    [query, filters, sorts, columns, savedViews, selectedId]
  );

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
}

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error('useCRM must be used within CRMProvider');
  return ctx;
}

export default CRMContext;
