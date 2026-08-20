import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchWhatCashKnows, type KnownCategory, type KnownResult } from "@/lib/jarvis/search";
import { useJarvis } from "@/lib/jarvis/context";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Search what Cash knows — Cash Holdings" },
      {
        name: "description",
        content:
          "One retrieval surface across sources, documents, evidence, brands, projects, CRM context and durable intelligence.",
      },
      { property: "og:title", content: "Search what Cash knows — Cash Holdings" },
      {
        property: "og:description",
        content: "Universal retrieval across the Cash Holdings operating record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgePage,
});

const FILTERS: { key: KnownCategory | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "knowledge", label: "Records" },
  { key: "work", label: "Work" },
  { key: "crm", label: "Relationships" },
  { key: "intelligence", label: "Memory" },
];

function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<KnownCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const { setOpen, ask } = useJarvis();

  // Retrieval as you type — one search surface, no submit ceremony.
  useEffect(() => {
    const t = setTimeout(() => setQuery(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: ["known", query],
    enabled: query.trim().length > 1,
    staleTime: 30_000,
    retry: false,
    queryFn: () => searchWhatCashKnows(query),
  });

  const shown = useMemo(() => {
    const all = results.data ?? [];
    return filter === "all" ? all : all.filter((r) => r.category === filter);
  }, [results.data, filter]);

  return (
    <div className="min-w-0 max-w-[900px]">
      <h1 className="text-[19px] font-medium tracking-tight">Search what Cash knows</h1>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        One place to retrieve across the operating record — records, work, relationships and memory.
      </p>

      <div className="mt-5 flex items-center gap-2 h-10 px-3 rounded-[11px] bg-[var(--surface-2)]">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Ask for anything Cash has recorded…"
          className="flex-1 min-w-0 bg-transparent text-[13px] focus:outline-none"
          aria-label="Search what Cash knows"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 edge-b pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-[12.5px] motion-micro",
              filter === f.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        {query && (
          <button
            onClick={() => {
              setOpen(true);
              void ask(`What does Cash know about: ${query}`);
            }}
            className="ml-auto mono-label !text-[8.5px] !text-teal motion-micro"
          >
            ASK JARVIS →
          </button>
        )}
      </div>

      <div className="pt-3">
        {!query && (
          <p className="text-[12.5px] text-muted-foreground">
            Start typing to retrieve. Nothing is inferred here — results are what Cash has recorded.
          </p>
        )}
        {query && results.isFetching && (
          <p className="mono-label !text-[8.5px] !text-muted-foreground/60">RETRIEVING…</p>
        )}
        {query && !results.isFetching && shown.length === 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            Nothing matched “{query}” in this view.
          </p>
        )}

        <ul className="divide-y divide-[var(--edge)]">
          {shown.map((r) => (
            <li key={`${r.category}-${r.id}`} className="py-3">
              <ResultRow
                result={r}
                open={openId === `${r.category}-${r.id}`}
                onToggle={() =>
                  setOpenId(openId === `${r.category}-${r.id}` ? null : `${r.category}-${r.id}`)
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ResultRow({
  result,
  open,
  onToggle,
}: {
  result: KnownResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-3">
        <span className="text-[13.5px] truncate">{result.title}</span>
        <span className="mono-label !text-[8.5px] !text-muted-foreground/60 shrink-0">
          {result.type.toUpperCase()}
        </span>
        {result.context && (
          <span className="mono-label !text-[8.5px] !text-teal/80 shrink-0">
            {result.context.toUpperCase()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {result.to && (
            <Link to={result.to} className="mono-label !text-[8.5px] !text-muted-foreground/60 hover:!text-foreground motion-micro">
              OPEN
            </Link>
          )}
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground motion-micro"
            aria-label="Show detail"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 motion-micro", open && "rotate-90")} />
          </button>
        </div>
      </div>
      {result.excerpt && (
        <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground line-clamp-2">
          {result.excerpt}
        </p>
      )}
      {open && (
        <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 mono-label !text-[8.5px] !text-muted-foreground/60">
          <dt>SOURCE</dt>
          <dd className="normal-case tracking-normal text-[11.5px] text-muted-foreground">
            {result.source ?? "—"}
          </dd>
          <dt>REFERENCE</dt>
          <dd className="normal-case tracking-normal text-[11.5px] text-muted-foreground break-all">
            {result.id}
          </dd>
        </dl>
      )}
    </div>
  );
}