import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { athrtyRecordsQuery } from "@/lib/athrty/queries";
import {
  interestTone,
  openValue,
  stageLabel,
  stageTone,
  type AthrtyRecord,
} from "@/lib/athrty/model";
import { formatCurrency, formatNumber } from "@/lib/domain";
import { Chip, DueDate, ErrorNote, Val } from "@/components/athrty/bits";
import { AccountInspector } from "@/components/athrty/inspector";

export const Route = createFileRoute("/_authenticated/athrty/pipeline")({
  head: () => ({
    meta: [
      { title: "ATHRTY Pipeline — Cash Holdings" },
      {
        name: "description",
        content:
          "Read-only ATHRTY pipeline board grouped by pipeline stage with weighted open value per column.",
      },
      { property: "og:title", content: "ATHRTY Pipeline — Cash Holdings" },
      {
        property: "og:description",
        content: "Read-only pipeline board by stage with weighted open value per column.",
      },
    ],
  }),
  component: AthrtyPipeline,
});

/** Preferred column order; any unrecognized stage is appended in data order. */
const STAGE_ORDER = [
  "new",
  "researched",
  "attempting",
  "contacted",
  "qualified",
  "follow_up",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
];

const rank = (stage: string) => {
  const key = stage.toLowerCase().replace(/[\s-]+/g, "_");
  const i = STAGE_ORDER.indexOf(key);
  return i === -1 ? STAGE_ORDER.length + 1 : i;
};

function AthrtyPipeline() {
  const { data: records, isLoading, error } = useQuery(athrtyRecordsQuery());
  const [selected, setSelected] = useState<AthrtyRecord | null>(null);

  const columns = useMemo(() => {
    const map = new Map<string, AthrtyRecord[]>();
    for (const r of records ?? []) {
      const key = r.stage ?? "";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()]
      .map(([stage, list]) => ({
        stage,
        list: [...list].sort((a, b) => openValue(b) - openValue(a)),
        value: list.reduce((s, r) => s + openValue(r), 0),
      }))
      .sort((a, b) => rank(a.stage) - rank(b.stage) || b.list.length - a.list.length);
  }, [records]);

  if (error) return <ErrorNote error={error} />;

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-[268px] shrink-0 h-[420px] rounded-[10px] bg-[var(--surface-2)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-[10px] border border-edge px-4 py-10 text-center">
        <div className="text-[13px]">No pipeline records</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          Nothing has been synced from the ATHRTY Outbound list yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mono-label !text-[8px] !text-muted-foreground/60">
        READ-ONLY BOARD · STAGE CHANGES HAPPEN IN THE SOURCE LIST
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <section
            key={col.stage || "unstaged"}
            className="w-[268px] shrink-0 rounded-[10px] border border-edge bg-[var(--surface-1)] flex flex-col max-h-[calc(100vh-260px)]"
          >
            <header className="px-3 py-2.5 edge-b shrink-0">
              <div className="flex items-center justify-between gap-2">
                <Chip tone={stageTone(col.stage || null)}>{stageLabel(col.stage || null)}</Chip>
                <span className="tabular text-[11px] text-muted-foreground">
                  {formatNumber(col.list.length)}
                </span>
              </div>
              {col.value > 0 && (
                <div className="mt-1.5 tabular text-[12px] text-teal">
                  {formatCurrency(col.value)}
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {col.list.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left rounded-[8px] border border-edge/70 bg-[var(--surface-2)] px-2.5 py-2 hover:border-edge-strong motion-micro"
                >
                  <div className="text-[12px] truncate">
                    <Val>{r.company}</Val>
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">
                    {r.contact?.name ?? "No named contact"}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {r.interest && <Chip tone={interestTone(r.interest)}>{r.interest}</Chip>}
                    {openValue(r) > 0 && (
                      <span className="tabular text-[10.5px] text-teal">
                        {formatCurrency(openValue(r))}
                      </span>
                    )}
                  </div>
                  {r.nextActionDate && (
                    <div className="mt-1.5 text-[10.5px]">
                      <DueDate iso={r.nextActionDate} showRelative />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <AccountInspector record={selected} onClose={() => setSelected(null)} />
    </div>
  );
}