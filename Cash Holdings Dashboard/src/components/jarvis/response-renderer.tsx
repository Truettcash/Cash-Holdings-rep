import { useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronRight, Dot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JarvisAnswer, JarvisBlock, JarvisItem } from "@/lib/jarvis/types";

/**
 * Architectural response renderer. The default reading order is the simplest
 * useful structure — summary → finding → evidence → action. Anything more
 * technical (matrices, relationship maps, confidence, provenance) is held
 * behind an explicit disclosure so the surface stays calm.
 */

const STATE_LABEL: Record<string, string> = {
  known: "KNOWN",
  inferred: "INFERRED",
  unknown: "UNKNOWN",
};

export function StateTag({ state }: { state?: string }) {
  if (!state || !STATE_LABEL[state]) return null;
  return (
    <span
      className={cn(
        "mono-label !text-[8.5px] shrink-0",
        state === "known" && "text-teal",
        state === "inferred" && "text-muted-foreground",
        state === "unknown" && "text-amber-500/80",
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

function ItemLine({
  item,
  marker,
  technical,
}: {
  item: JarvisItem;
  marker?: "dot" | "check";
  technical?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      {marker === "check" ? (
        <Check className="h-3.5 w-3.5 mt-[3px] shrink-0 text-teal" />
      ) : marker === "dot" ? (
        <Dot className="h-4 w-4 mt-[1px] shrink-0 text-muted-foreground" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] leading-5">{item.label}</span>
          <StateTag state={item.state} />
          {technical && typeof item.confidence === "number" && (
            <span className="mono-label !text-[8.5px] !text-muted-foreground/60">
              {Math.round((item.confidence > 1 ? item.confidence : item.confidence * 100))}%
            </span>
          )}
          {item.meta && (
            <span className="ml-auto mono-label !text-[8.5px] !text-muted-foreground/60 shrink-0">
              {item.meta}
            </span>
          )}
        </div>
        {item.detail && (
          <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{item.detail}</p>
        )}
      </div>
    </div>
  );
}

function Block({ block, technical }: { block: JarvisBlock; technical?: boolean }) {
  const items = block.items ?? [];
  return (
    <section className="pt-3">
      {block.title && (
        <div className="mono-label !text-[8.5px] !text-muted-foreground/60 pb-2">{block.title}</div>
      )}
      {block.kind === "flow" && (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i}>
              <ItemLine item={it} technical={technical} />
              {i < items.length - 1 && (
                <ArrowDown className="h-3 w-3 my-1 ml-[2px] text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      )}

      {block.kind === "hierarchy" && (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} style={{ paddingLeft: i === 0 ? 0 : 14 }}>
              <ItemLine item={it} marker={i === 0 ? undefined : "dot"} technical={technical} />
            </div>
          ))}
        </div>
      )}

      {block.kind === "timeline" && (
        <div className="relative pl-4 space-y-3 before:absolute before:left-[3px] before:top-1 before:bottom-1 before:w-px before:bg-edge">
          {items.map((it, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-4 top-[7px] h-[5px] w-[5px] rounded-full bg-teal" />
              <ItemLine item={it} technical={technical} />
            </div>
          ))}
        </div>
      )}

      {block.kind === "relationship" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[12.5px] px-2 py-1 rounded-[7px] bg-[var(--surface-2)]">
                {it.label}
              </span>
              {i < items.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
            </div>
          ))}
        </div>
      )}

      {(block.kind === "status" || block.kind === "evidence" || block.kind === "decision") && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <ItemLine
              key={i}
              item={it}
              marker={block.kind === "evidence" ? "dot" : undefined}
              technical={technical}
            />
          ))}
        </div>
      )}

      {block.kind === "actions" && (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mono-label !text-[8.5px] !text-teal mt-[3px] w-4 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <ItemLine item={it} technical={technical} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {block.kind === "comparison" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((it, i) => (
            <div key={i} className="edge-t pt-2">
              <ItemLine item={it} technical={technical} />
            </div>
          ))}
        </div>
      )}

      {block.kind === "table" && block.rows && block.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            {block.columns && (
              <thead>
                <tr className="edge-b">
                  {block.columns.map((c) => (
                    <th
                      key={c}
                      className="text-left font-normal pb-1.5 mono-label !text-[8.5px] !text-muted-foreground/60"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="edge-b last:border-b-0">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1.5 pr-3 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Kinds the operator reads first; everything else is technical detail. */
const PRIMARY_KINDS = new Set(["status", "decision", "flow", "timeline", "evidence", "actions"]);
const ORDER: JarvisBlock["kind"][] = ["status", "flow", "timeline", "decision", "evidence", "actions"];

export function JarvisResponse({
  answer,
  onReviewCandidate,
}: {
  answer: JarvisAnswer;
  onReviewCandidate?: () => void;
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const primary = answer.blocks
    .filter((b) => PRIMARY_KINDS.has(b.kind))
    .slice()
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const technical = answer.blocks.filter((b) => !PRIMARY_KINDS.has(b.kind));

  return (
    <div className="min-w-0">
      <p className="text-[13.5px] leading-6">{answer.summary}</p>

      {primary.map((b, i) => (
        <Block key={`p${i}`} block={b} />
      ))}

      {answer.unknowns.length > 0 && (
        <section className="pt-3">
          <div className="mono-label !text-[8.5px] !text-amber-500/80 pb-1.5">WHAT'S MISSING</div>
          <ul className="space-y-1">
            {answer.unknowns.map((u, i) => (
              <li key={i} className="text-[12.5px] leading-5 text-muted-foreground">
                {u}
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.candidates.length > 0 && (
        <section className="pt-3">
          <div className="mono-label !text-[8.5px] !text-muted-foreground/60 pb-1.5">
            NEEDS YOUR DECISION
          </div>
          <div className="space-y-2">
            {answer.candidates.map((c, i) => (
              <div key={i} className="edge-t pt-2">
                <ItemLine
                  item={{ label: c.title, detail: c.rationale, state: "inferred" }}
                />
              </div>
            ))}
          </div>
          {onReviewCandidate && (
            <button
              onClick={onReviewCandidate}
              className="mt-2 mono-label !text-[8.5px] !text-teal hover:opacity-80 motion-micro"
            >
              TAKE INTO REVIEW →
            </button>
          )}
        </section>
      )}

      {technical.length > 0 && (
        <section className="pt-3">
          <button
            onClick={() => setTechnicalOpen((o) => !o)}
            className="inline-flex items-center gap-1 mono-label !text-[8.5px] !text-muted-foreground/60 hover:!text-foreground motion-micro"
            aria-expanded={technicalOpen}
          >
            <ChevronRight className={cn("h-3 w-3 motion-micro", technicalOpen && "rotate-90")} />
            REASONING DETAIL
          </button>
          {technicalOpen &&
            technical.map((b, i) => <Block key={`t${i}`} block={b} technical />)}
        </section>
      )}
    </div>
  );
}