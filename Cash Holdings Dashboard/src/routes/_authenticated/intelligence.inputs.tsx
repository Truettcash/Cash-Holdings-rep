import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useJarvisSelection } from "@/lib/jarvis/context";
import {
  evidenceRefsQuery,
  knowledgeContentQuery,
  knowledgeDocumentsQuery,
  knowledgeSourcesQuery,
} from "@/lib/cash-intelligence/queries";
import { absoluteTime, str } from "@/lib/cash-intelligence/normalize";
import {
  EmptyState,
  EpistemicTag,
  Field,
  LoadingRows,
  Mono,
  Panel,
  ProvenanceChain,
  ServiceState,
} from "@/components/intel/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/intelligence/inputs")({
  component: EvidenceWorkspace,
});

function EvidenceWorkspace() {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  useJarvisSelection(
    documentId || contentId
      ? {
          entityType: "knowledge_document",
          entityId: documentId ?? contentId ?? undefined,
          evidence: contentId ?? documentId ?? undefined,
        }
      : null,
  );

  const sources = useQuery(knowledgeSourcesQuery());
  const documents = useQuery(knowledgeDocumentsQuery(sourceId));
  const content = useQuery(knowledgeContentQuery(documentId));
  const refs = useQuery(evidenceRefsQuery());

  const document = (documents.data ?? []).find((d) => d.id === documentId) ?? null;
  const source =
    (sources.data ?? []).find((s) => s.id === (document?.sourceId ?? sourceId)) ?? null;
  const chunk = (content.data ?? []).find((c) => c.id === contentId) ?? null;

  const matchedRefs = (refs.data ?? []).filter((r) => {
    const ids = [
      str(r, ["content_id", "knowledge_content_id"]),
      str(r, ["document_id", "knowledge_document_id"]),
    ];
    return ids.some((id) => id && (id === contentId || id === documentId));
  });

  return (
    <div className="space-y-4">
      <Panel title="INPUTS" meta="what the system can read — not yet accepted">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Everything here is stored material. It becomes evidence only when intelligence points at
          it, and it is only remembered after you accept it in Review.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[260px_1fr_340px]">
        <Panel title="SOURCES" meta={sources.data ? `${sources.data.length}` : undefined}>
          {sources.isLoading ? (
            <LoadingRows rows={6} />
          ) : sources.error ? (
            <ServiceState error={sources.error} label="Knowledge sources" />
          ) : (sources.data ?? []).length === 0 ? (
            <EmptyState title="No sources" note="The knowledge layer has no registered sources." />
          ) : (
            <ul className="-mx-1">
              <ListButton
                active={sourceId === null}
                onClick={() => {
                  setSourceId(null);
                  setDocumentId(null);
                  setContentId(null);
                }}
                title="All sources"
              />
              {(sources.data ?? []).map((s) => (
                <ListButton
                  key={s.id}
                  active={sourceId === s.id}
                  onClick={() => {
                    setSourceId(s.id);
                    setDocumentId(null);
                    setContentId(null);
                  }}
                  title={s.name ?? s.id ?? "—"}
                  sub={[s.kind, s.workspace].filter(Boolean).join(" · ") || undefined}
                />
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="DOCUMENTS" meta={documents.data ? `${documents.data.length}` : undefined}>
            {documents.isLoading ? (
              <LoadingRows rows={7} />
            ) : documents.error ? (
              <ServiceState error={documents.error} label="Knowledge documents" />
            ) : (documents.data ?? []).length === 0 ? (
              <EmptyState title="No documents" note="No documents under this source." />
            ) : (
              <ul className="-mx-1 max-h-[320px] overflow-auto">
                {(documents.data ?? []).map((d) => (
                  <ListButton
                    key={d.id}
                    active={documentId === d.id}
                    onClick={() => {
                      setDocumentId(d.id);
                      setContentId(null);
                    }}
                    title={d.title ?? d.id ?? "—"}
                    sub={
                      [d.kind, d.workspace, absoluteTime(d.updatedAt ?? d.createdAt)]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="CONTENT"
            meta={documentId ? undefined : "select a document"}
            actions={<EpistemicTag kind="observed" label="RAW KNOWLEDGE" />}
          >
            {!documentId ? (
              <EmptyState title="No document selected" />
            ) : content.isLoading ? (
              <LoadingRows rows={5} />
            ) : content.error ? (
              <ServiceState error={content.error} label="Document content" />
            ) : (content.data ?? []).length === 0 ? (
              <EmptyState title="No content returned" note="The document has no readable content." />
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-auto">
                {(content.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setContentId(c.id)}
                    className={cn(
                      "motion-micro block w-full rounded-[8px] border px-2.5 py-2 text-left",
                      contentId === c.id
                        ? "border-teal/35 bg-teal-soft"
                        : "border-edge bg-[var(--surface-2)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Mono>{c.heading ?? `SECTION ${c.position ?? "—"}`}</Mono>
                      <span className="font-mono text-[10px] text-muted-foreground/50">{c.id}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed">
                      {c.body ?? "—"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="LINEAGE">
            <ProvenanceChain
              steps={[
                { label: "SOURCE", value: source?.name ?? source?.id ?? null, kind: "observed" },
                { label: "DOCUMENT", value: document?.title ?? document?.id ?? null, kind: "observed" },
                { label: "CONTENT", value: chunk?.heading ?? chunk?.id ?? null, kind: "observed" },
                {
                  label: "INTELLIGENCE EVIDENCE REF",
                  value: matchedRefs.length ? `${matchedRefs.length} reference(s)` : null,
                  kind: "derived",
                },
              ]}
            />
          </Panel>

          <Panel
            title="USED BY INTELLIGENCE"
            actions={<EpistemicTag kind="derived" label="EVIDENCE" />}
          >
            {refs.isLoading ? (
              <LoadingRows rows={4} />
            ) : refs.error ? (
              <ServiceState error={refs.error} label="Intelligence evidence refs" />
            ) : matchedRefs.length === 0 ? (
              <EmptyState
                title="Not referenced by intelligence"
                note="This knowledge is stored but no intelligence evidence reference points at it."
              />
            ) : (
              <div className="space-y-2">
                {matchedRefs.map((r, i) => (
                  <div key={i} className="rounded border border-edge bg-[var(--surface-2)] px-2 py-1.5">
                    <Field
                      label="Ref"
                      value={<span className="font-mono text-[11px]">{str(r, ["id"])}</span>}
                    />
                    <Field label="Kind" value={str(r, ["kind", "evidence_type", "type"])} />
                    <Field label="Scope" value={str(r, ["scope", "workspace"])} />
                    <Field label="Created" value={absoluteTime(str(r, ["created_at"]))} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {document && (
            <Panel title="TECHNICAL DETAIL">
              <Field label="Document ID" value={<span className="font-mono text-[11px]">{document.id}</span>} />
              <Field label="Source ID" value={<span className="font-mono text-[11px]">{document.sourceId}</span>} />
              <Field label="Workspace / context" value={document.workspace} />
              <Field label="URI" value={document.uri} />
              <Field label="Created" value={absoluteTime(document.createdAt)} />
              <Field label="Updated" value={absoluteTime(document.updatedAt)} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function ListButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "motion-micro block w-full rounded-[7px] px-2 py-1.5 text-left",
          active ? "bg-[var(--surface-3)] text-foreground" : "hover:bg-[var(--surface-2)]",
        )}
      >
        <div className="truncate text-[12px]">{title}</div>
        {sub && <div className="truncate text-[10.5px] text-muted-foreground/65">{sub}</div>}
      </button>
    </li>
  );
}