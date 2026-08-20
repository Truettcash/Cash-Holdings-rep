import { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { Chip, DataRow, DueDate, SectionLabel, Val } from "./bits";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/domain";
import {
  brandLabel,
  dueBucket,
  interestTone,
  openValue,
  stageLabel,
  stageTone,
  type AthrtyRecord,
} from "@/lib/athrty/model";
import { cn } from "@/lib/utils";

function pct(n: number | null) {
  if (n === null) return null;
  return `${Math.round(n > 1 ? n : n * 100)}%`;
}

/**
 * Right-side account inspector: normalized sales state plus the source trace
 * that answers "where did this information come from?".
 */
export function AccountInspector({
  record,
  onClose,
}: {
  record: AthrtyRecord | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, onClose]);

  if (!record) return null;
  const r = record;
  const bucket = dueBucket(r.nextActionDate);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-canvas/70 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
        aria-label="Close inspector"
      />
      <aside className="relative h-full w-[460px] max-w-[94vw] flex flex-col edge-l chrome-blur ch-drawer-in overflow-hidden">
        <header className="shrink-0 edge-b px-5 h-14 flex items-center gap-3">
          <div className="min-w-0">
            <div className="mono-label !text-[8px] !text-muted-foreground/60">ACCOUNT</div>
            <h2 className="text-[14px] font-medium tracking-tight truncate">
              <Val>{r.company}</Val>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          {/* Next action — the operational headline */}
          <div
            className={cn(
              "mt-4 rounded-[10px] border px-4 py-3",
              bucket === "overdue"
                ? "border-danger/35 bg-danger/8"
                : bucket === "today"
                  ? "border-warn/35 bg-warn/8"
                  : "border-edge bg-[var(--surface-2)]",
            )}
          >
            <div className="mono-label !text-[8px] !text-muted-foreground/70">NEXT ACTION</div>
            <div className="mt-1.5 text-[13px] leading-snug">
              <Val>{r.nextAction}</Val>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <DueDate iso={r.nextActionDate} showRelative />
              {bucket === "today" && <Chip tone="warn">due today</Chip>}
              {bucket === "none" && <Chip tone="muted">no date</Chip>}
              {r.owner && <span className="text-muted-foreground/80">· {r.owner}</span>}
            </div>
          </div>

          <SectionLabel>ACCOUNT</SectionLabel>
          <DataRow label="Company" value={r.company} />
          <DataRow label="Account ID" value={r.accountId} />
          <DataRow label="Lead ID" value={r.leadId} />
          <DataRow label="Canonical brand" value={brandLabel(r.canonicalBrand)} />
          <DataRow label="Original route" value={r.sourceRoute} />
          <DataRow label="Account type" value={r.accountType} />
          <DataRow label="Account status" value={r.accountStatus} />
          <DataRow label="Tier" value={r.tier} />
          <DataRow label="Industry" value={r.industry} />
          <DataRow label="City" value={r.city} />
          <DataRow label="Market" value={r.market} />
          <DataRow
            label="Website"
            value={
              r.website ? (
                <a
                  href={/^https?:/i.test(r.website) ? r.website : `https://${r.website}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-teal hover:underline inline-flex items-center gap-1"
                >
                  {r.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null
            }
          />
          <DataRow label="Phone" value={r.phone} />

          <SectionLabel>CONTACT</SectionLabel>
          {r.contact ? (
            <>
              <DataRow label="Name" value={r.contact.name} />
              <DataRow label="Role" value={r.contact.role} />
              <DataRow label="Phone" value={r.contact.phone} />
              <DataRow
                label="Email"
                value={
                  r.contact.email ? (
                    <a href={`mailto:${r.contact.email}`} className="text-teal hover:underline">
                      {r.contact.email}
                    </a>
                  ) : null
                }
              />
            </>
          ) : (
            <div className="py-2 text-[12px] text-muted-foreground">
              No named contact identified
            </div>
          )}

          <SectionLabel>SALES STATE</SectionLabel>
          <DataRow
            label="Pipeline stage"
            value={<Chip tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Chip>}
          />
          <DataRow label="Call status" value={r.callStatus} />
          <DataRow label="Attempts" value={r.attempts === null ? null : String(r.attempts)} />
          <DataRow label="Last contact" value={r.lastContactDate ? formatDate(r.lastContactDate) : null} />
          <DataRow label="Call outcome" value={r.callOutcome} />
          <DataRow
            label="Need confirmed"
            value={r.needConfirmed === null ? null : r.needConfirmed ? "Yes" : "No"}
          />
          <DataRow
            label="Interest"
            value={r.interest ? <Chip tone={interestTone(r.interest)}>{r.interest}</Chip> : null}
          />
          <DataRow label="Offer discussed" value={r.offerDiscussed} />
          <DataRow
            label="Quoted price"
            value={r.quotedPrice === null ? null : formatCurrency(r.quotedPrice)}
          />
          <DataRow label="Probability" value={pct(r.probability)} />
          <DataRow label="Weighted pipeline" value={formatCurrency(openValue(r))} />
          <DataRow label="Proposal status" value={r.proposalStatus} />
          <DataRow label="Closed outcome" value={r.closedOutcome} />
          <DataRow
            label="Revenue won"
            value={r.revenueWon === null ? null : formatCurrency(r.revenueWon)}
          />

          <SectionLabel>NOTES</SectionLabel>
          <NoteBlock label="Observed gap" text={r.observedGap} />
          <NoteBlock label="Notes" text={r.notes} />
          <NoteBlock label="Call notes" text={r.callNotes} />
          {r.sourceUrls.length > 0 && (
            <div className="mt-2 space-y-1">
              {r.sourceUrls.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block text-[11.5px] text-teal hover:underline truncate"
                >
                  {u}
                </a>
              ))}
            </div>
          )}

          <SectionLabel>SOURCE TRACE</SectionLabel>
          <DataRow label="Source" value="Microsoft 365 / SharePoint" />
          <DataRow label="List" value={r.sourceList ?? "ATHRTY Outbound"} />
          <DataRow label="SharePoint item ID" value={r.sharepointItemId} />
          <DataRow label="Account ID" value={r.accountId} />
          <DataRow label="Lead ID" value={r.leadId} />
          <DataRow label="Mapping status" value={r.mappingStatus} />
          <DataRow
            label="External created"
            value={r.externalCreatedAt ? formatDateTime(r.externalCreatedAt) : null}
          />
          <DataRow
            label="External modified"
            value={r.externalModifiedAt ? formatDateTime(r.externalModifiedAt) : null}
          />
          <DataRow label="Last seen" value={r.lastSeenAt ? formatDateTime(r.lastSeenAt) : null} />
          <DataRow
            label="Last synced"
            value={r.lastSyncedAt ? formatDateTime(r.lastSyncedAt) : null}
          />
          <DataRow label="Canonical brand" value={brandLabel(r.canonicalBrand)} />
          <DataRow label="Organization link" value={r.organizationId ? "Mapped" : "Not mapped"} />
          <DataRow label="Contact link" value={r.contactId ? "Mapped" : "No named person"} />
          <DataRow label="Engagement link" value={r.engagementId ? "Mapped" : "Not mapped"} />
        </div>
      </aside>
    </div>
  );
}

function NoteBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="py-1.5">
      <div className="mono-label !text-[8px] !text-muted-foreground/55">{label}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}