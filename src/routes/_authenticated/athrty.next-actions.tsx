import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { athrtyRecordsQuery } from "@/lib/athrty/queries";
import {
  dueBucket,
  interestTone,
  isClosed,
  openValue,
  stageLabel,
  stageTone,
  type AthrtyRecord,
  type DueBucket,
} from "@/lib/athrty/model";
import { formatCurrency, formatNumber } from "@/lib/domain";
import { Chip, DueDate, ErrorNote, TableSkeleton, Val } from "@/components/athrty/bits";
import { AccountInspector } from "@/components/athrty/inspector";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athrty/next-actions")({
  head: () => ({
    meta: [
      { title: "ATHRTY Next Actions — Cash Holdings" },
      {
        name: "description",
        content:
          "Operator queue of ATHRTY outbound follow-ups grouped into overdue, today and upcoming.",
      },
      { property: "og:title", content: "ATHRTY Next Actions — Cash Holdings" },
      {
        property: "og:description",
        content: "Outbound follow-up queue grouped into overdue, today and upcoming.",
      },
    ],
  }),
  component: AthrtyNextActions,
});

const GROUPS: { bucket: DueBucket; label: string; tone: string }[] = [
  { bucket: "overdue", label: "OVERDUE", tone: "!text-danger" },
  { bucket: "today", label: "TODAY", tone: "!text-warn" },
  { bucket: "upcoming", label: "UPCOMING", tone: "!text-foreground/80" },
  { bucket: "none", label: "NO DATE SET", tone: "!text-muted-foreground" },
];

function AthrtyNextActions() {
  const { data: records, isLoading, error } = useQuery(athrtyRecordsQuery());
  const [selected, setSelected] = useState<AthrtyRecord | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<DueBucket, AthrtyRecord[]>();
    for (const r of records ?? []) {
      if (!includeClosed && isClosed(r)) continue;
      const bucket = dueBucket(r.nextActionDate);
      map.set(bucket, [...(map.get(bucket) ?? []), r]);
    }
    for (const [k, list] of map)
      map.set(
        k,
        [...list].sort(
          (a, b) =>
            (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? "") ||
            openValue(b) - openValue(a),
        ),
      );
    return map;
  }, [records, includeClosed]);

  if (error) return <ErrorNote error={error} />;
  if (isLoading)
    return (
      <div className="rounded-[10px] border border-edge">
        <TableSkeleton rows={12} cols={5} />
      </div>
    );

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 text-[11.5px] text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={includeClosed}
          onChange={(e) => setIncludeClosed(e.target.checked)}
          className="accent-teal"
        />
        Include closed accounts
      </label>

      {GROUPS.map((g) => {
        const list = grouped.get(g.bucket) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={g.bucket} className="rounded-[10px] border border-edge bg-[var(--surface-1)]">
            <header className="flex items-center justify-between px-4 h-9 edge-b">
              <div className={cn("mono-label !text-[8px]", g.tone)}>{g.label}</div>
              <span className="tabular text-[11px] text-muted-foreground">
                {formatNumber(list.length)}
              </span>
            </header>
            <div>
              {list.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-4 border-b border-edge/40 last:border-0 hover:bg-[var(--surface-2)] motion-micro"
                >
                  <div className="w-[128px] shrink-0 text-[11.5px] pt-[1px]">
                    <DueDate iso={r.nextActionDate} showRelative />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] truncate">
                      <Val>{r.company}</Val>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground truncate">
                      <Val>{r.nextAction}</Val>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {r.interest && <Chip tone={interestTone(r.interest)}>{r.interest}</Chip>}
                    <Chip tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Chip>
                  </div>
                  <div className="w-[92px] shrink-0 text-right tabular text-[11.5px] text-teal">
                    {openValue(r) > 0 ? formatCurrency(openValue(r)) : ""}
                  </div>
                  <div className="hidden lg:block w-[120px] shrink-0 text-[11.5px] text-muted-foreground truncate">
                    <Val>{r.contact?.name ?? r.owner}</Val>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {[...grouped.values()].every((l) => l.length === 0) && (
        <div className="rounded-[10px] border border-edge px-4 py-10 text-center">
          <div className="text-[13px]">Queue is clear</div>
          <div className="mt-1 text-[11.5px] text-muted-foreground">
            No open accounts carry a next action.
          </div>
        </div>
      )}

      <AccountInspector record={selected} onClose={() => setSelected(null)} />
    </div>
  );
}