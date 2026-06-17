"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { FollowupChip, followupBucketFor } from "@/components/pipeline/followup-chip";
import { FolderPicker } from "@/components/pipeline/folder-picker";
import { LazyCommentThread } from "@/components/comments/comment-thread";
import { Combobox } from "@/components/ui/combobox";
import { StatusPill } from "@/components/ui/status-pill";
import {
  buildTagLabelMap,
  displayTag,
  isHotLead,
  leadTemperatureForTags,
  normalizeTagName,
  setExclusiveNormalizedTag,
  toggleNormalizedTag
} from "@/lib/pipeline-taxonomy";
import { isPipelineStalled, needsLeadOwner, pipelineOwnerName, pipelinePlaybook, pipelineStatusLabel, type PipelineSourceLead } from "@/lib/pipeline-insights";
import { formatCurrency, formatDateTime, maskEmail, maskMobile, quoteStatusTone } from "@/lib/utils";
import { cn } from "@/lib/utils";

type PipelineContact = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
};

type PipelineEmailEvent = {
  id: string;
  recipient_email: string | null;
  subject: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

type PipelineListQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  currency_code: string;
  total_amount: number;
  sent_date: string | null;
  last_opened: string | null;
  open_count: number;
  pipeline_category: string;
  followup_date: string | null;
  pipeline_comment: string | null;
  tags: string[] | null;
  folder_id: string | null;
  clients: {
    name: string;
    code: string | null;
    group_id: string | null;
    contact_details: PipelineContact | null;
  } | null;
  source_lead: PipelineSourceLead;
  service_requested: string[];
  email_events: PipelineEmailEvent[];
};

type FolderOption = { id: string; name: string };
type TagOption = { id: string; name: string; category_name?: string | null };

type PipelineListProps = {
  quotes: PipelineListQuote[];
  folders: FolderOption[];
  tags: TagOption[];
  categories: string[];
  showFullContact: boolean;
  savingIds?: Record<string, boolean>;
  rowErrors?: Record<string, string>;
  onCommit: (
    quoteId: string,
    patch: Partial<{
      status: string;
      folder_id: string | null;
      pipeline_category: string;
      followup_date: string | null;
      pipeline_comment: string;
      tags: string[];
    }>
  ) => void;
  /** Current viewer — needed by the comment thread for authorship. */
  currentUser: { id: string; full_name: string; email: string };
  /** True if the viewer can create folders/tag categories inline. */
  canManagePipelineTaxonomy?: boolean;
  /** Callback fired when a new folder is created via the inline picker. */
  onFolderCreated?: (folder: { id: string; name: string }) => void;
};

const STATUS_OPTIONS = [
  "sent",
  "viewed",
  "negotiating",
  "accepted",
  "expired",
  "refresh_requested",
  "lost",
  "lost_nurture",
  "dormant",
  "spam",
  "superseded"
] as const;

type SortKey = "recent" | "followup" | "amount" | "client";

export function PipelineList({
  quotes,
  folders,
  tags,
  categories,
  showFullContact,
  savingIds,
  rowErrors,
  onCommit,
  currentUser,
  canManagePipelineTaxonomy,
  onFolderCreated
}: PipelineListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "recent", dir: "desc" });
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const tagLabelMap = useMemo(() => buildTagLabelMap(tags), [tags]);
  const groupedTags = useMemo(() => groupTags(tags), [tags]);
  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);

  const sortedQuotes = useMemo(() => sortQuotes(quotes, sort), [quotes, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current.key !== key) return { key, dir: defaultDir(key) };
      return { key, dir: current.dir === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#d9ded1] bg-white shadow-sm">
      <div className="overflow-x-auto pb-3 [scrollbar-gutter:stable]">
        <table className="min-w-[980px] w-full border-collapse text-sm">
          <thead className="border-b border-[#e6ebdc] bg-[#f8f9f4] text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-8 px-3 py-3"></th>
              <SortHeader label="Client" active={sort.key === "client"} dir={sort.dir} onClick={() => toggleSort("client")} />
              <th className="px-3 py-3 font-black">Service requested</th>
              <th className="px-3 py-3 font-black">Status</th>
              <SortHeader label="Follow-up" active={sort.key === "followup"} dir={sort.dir} onClick={() => toggleSort("followup")} />
              <SortHeader label="Amount" active={sort.key === "amount"} dir={sort.dir} onClick={() => toggleSort("amount")} className="text-right" />
              <SortHeader label="Sent" active={sort.key === "recent"} dir={sort.dir} onClick={() => toggleSort("recent")} />
              <th className="px-3 py-3 font-black">Quote</th>
            </tr>
          </thead>
          <tbody>
            {sortedQuotes.map((row) => {
              const expanded = expandedId === row.id;
              const contact = row.clients?.contact_details ?? null;
              const saving = savingIds?.[row.id];
              const folderName = row.folder_id ? foldersById.get(row.folder_id) ?? null : null;
              const temperature = leadTemperatureForTags(row.tags);
              const hotLead = isHotLead({ status: row.status, tags: row.tags });
              const play = pipelinePlaybook(row);
              const ownerName = pipelineOwnerName(row.source_lead);
              const stalled = isPipelineStalled(row);

              return (
                <Fragment key={row.id}>
                  <tr className={cn("border-t border-[#eef1e7] align-top", expanded ? "bg-[#fcfdf7]" : "hover:bg-[#fcfdf9]")}>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse" : "Expand"}
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#d9ded1] bg-white text-neutral-500"
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[180px]">
                        <p className="font-black text-black">{row.clients?.name ?? "Client"}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {row.clients?.code ? `Client ${row.clients.code}` : "Temp client"}
                          {row.clients?.group_id ? ` | Group ${row.clients.group_id}` : ""}
                        </p>
                        {row.source_lead?.id ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
                            <Link href={`/leads?selected=${row.source_lead.id}`} className="font-semibold text-[#6a912f] hover:underline">
                              {row.source_lead.lead_code ?? "Open lead"}
                            </Link>
                            <span>|</span>
                            <span>{ownerName}</span>
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-neutral-400">Standalone quote</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <MetaPill muted={!folderName}>{folderName ?? "Unfiled"}</MetaPill>
                          <MetaPill>{row.pipeline_category || "General"}</MetaPill>
                          {temperature ? <TemperaturePill value={temperature} /> : hotLead ? <StatePill tone="red">In play</StatePill> : null}
                          {!row.followup_date ? <StatePill tone="amber">No follow-up</StatePill> : null}
                          {stalled ? <StatePill tone="red">Stalled</StatePill> : null}
                          {needsLeadOwner(row.source_lead) ? <StatePill tone="amber">Needs owner</StatePill> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[220px] max-w-[280px]">
                        <p className="line-clamp-2 font-semibold text-neutral-800">{formatServiceRequested(row.service_requested)}</p>
                        {row.service_requested.length > 1 ? (
                          <p className="mt-0.5 text-[11px] text-neutral-500">{row.service_requested.length} services</p>
                        ) : null}
                        <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-neutral-600">
                          <span className="font-bold text-neutral-700">{play.label}:</span> {play.helper}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="focus-ring min-h-9 min-w-[140px] rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-xs font-semibold text-black"
                        value={row.status}
                        onChange={(event) => onCommit(row.id, { status: event.currentTarget.value })}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {pipelineStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1">
                        <StatusPill tone={quoteStatusTone(row.status)}>{pipelineStatusLabel(row.status)}</StatusPill>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <FollowupChip
                        value={row.followup_date}
                        onChange={(next) => onCommit(row.id, { followup_date: next })}
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-black text-black">{formatCurrency(row.total_amount, row.currency_code)}</p>
                      <p className="text-[11px] text-neutral-500">{row.currency_code}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs text-neutral-700">{formatDateTime(row.sent_date)}</p>
                      <p className="text-[11px] text-neutral-500">{row.open_count} opens</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/quotes/${row.id}`}
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-xs font-bold text-black hover:bg-[#eef2e6]"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Open
                        </Link>
                        {row.source_lead?.id ? (
                          <Link
                            href={`/leads?selected=${row.source_lead.id}`}
                            className="focus-ring inline-flex items-center gap-1 rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-xs font-bold text-black hover:bg-[#eef2e6]"
                          >
                            Lead
                          </Link>
                        ) : null}
                        {saving ? <span className="text-[11px] font-bold text-neutral-400">Saving...</span> : null}
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-neutral-500">{row.quote_id_formatted}</p>
                    </td>
                  </tr>

                  {expanded ? (
                    <tr className="border-t border-[#eef1e7] bg-[#fbfcf8]">
                      <td colSpan={8} className="px-4 py-4">
                        <ExpandedDetail
                          row={row}
                          contact={contact}
                          showFullContact={showFullContact}
                          folders={folders}
                          categories={categories}
                          groupedTags={groupedTags}
                          tagLabelMap={tagLabelMap}
                          folderName={folderName}
                          tagDraft={tagDrafts[row.id] ?? ""}
                          onTagDraftChange={(value) => setTagDrafts((current) => ({ ...current, [row.id]: value }))}
                          onCommit={(patch) => onCommit(row.id, patch)}
                          savingIds={savingIds}
                          rowErrors={rowErrors}
                          currentUser={currentUser}
                          canManagePipelineTaxonomy={canManagePipelineTaxonomy}
                          onFolderCreated={onFolderCreated}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!sortedQuotes.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-neutral-500">
                  No quotes match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-3 font-black", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "focus-ring inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wide",
          active ? "text-black" : "text-neutral-500 hover:text-black"
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

function ExpandedDetail({
  row,
  contact,
  showFullContact,
  folders,
  categories,
  groupedTags,
  tagLabelMap,
  folderName,
  tagDraft,
  onTagDraftChange,
  onCommit,
  savingIds,
  rowErrors,
  currentUser,
  canManagePipelineTaxonomy,
  onFolderCreated
}: {
  row: PipelineListQuote;
  contact: PipelineContact | null;
  showFullContact: boolean;
  folders: FolderOption[];
  categories: string[];
  groupedTags: Array<{ category: string; tags: TagOption[] }>;
  tagLabelMap: Map<string, string>;
  folderName: string | null;
  tagDraft: string;
  onTagDraftChange: (next: string) => void;
  onCommit: (
    patch: Partial<{
      status: string;
      folder_id: string | null;
      pipeline_category: string;
      followup_date: string | null;
      pipeline_comment: string;
      tags: string[];
    }>
  ) => void;
  savingIds?: Record<string, boolean>;
  rowErrors?: Record<string, string>;
  currentUser: { id: string; full_name: string; email: string };
  canManagePipelineTaxonomy?: boolean;
  onFolderCreated?: (folder: { id: string; name: string }) => void;
}) {
  const saving = savingIds?.[row.id];
  const temperature = leadTemperatureForTags(row.tags);
  const health = describeLeadHealth(row.status, row.tags, row.followup_date);
  const play = pipelinePlaybook(row);
  const ownerName = pipelineOwnerName(row.source_lead);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-md border border-[#e6ebdc] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Lead cockpit</p>
          {saving ? <span className="text-[11px] font-bold text-neutral-400">Saving...</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FollowupChip value={row.followup_date} onChange={(next) => onCommit({ followup_date: next })} />
          <StatePill tone={health.tone}>{health.label}</StatePill>
          {temperature ? <TemperaturePill value={temperature} /> : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-neutral-600">{health.helper}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          <MetaPill muted={!folderName}>{folderName ?? "Unfiled"}</MetaPill>
          <MetaPill>{row.pipeline_category || "General"}</MetaPill>
        </div>

        <div className="mt-4 rounded-md border border-[#eef1e7] bg-[#fbfcf8] p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Next best step</p>
          <p className="mt-2 text-sm font-bold text-black">{play.label}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-600">{play.helper}</p>
        </div>

        <div className="mt-4 rounded-md border border-[#eef1e7] bg-[#fbfcf8] p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Linked lead</p>
          {row.source_lead?.id ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-700">
                <Link href={`/leads?selected=${row.source_lead.id}`} className="font-bold text-[#6a912f] hover:underline">
                  {row.source_lead.lead_code ?? "Open lead"}
                </Link>
                <span>|</span>
                <span>{ownerName}</span>
                {needsLeadOwner(row.source_lead) ? <StatePill tone="amber">Needs owner</StatePill> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-neutral-600">
                Quote-stage follow-through is happening here, while full lead context and pre-quote history remain in the lead record.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              No lead is linked to this quote yet. It is being managed as a standalone commercial opportunity.
            </p>
          )}
        </div>

        <p className="mt-4 text-[11px] font-black uppercase tracking-wide text-neutral-500">Contact</p>
        <dl className="mt-3 space-y-2 text-xs leading-5 text-neutral-700">
          <ContactRow label="Email" value={formatContactValue(contact?.primary_email, showFullContact, "email")} />
          {contact?.secondary_email ? (
            <ContactRow label="Alt email" value={formatContactValue(contact.secondary_email, showFullContact, "email")} />
          ) : null}
          <ContactRow
            label="Mobile"
            value={formatContactValue(contact?.primary_mobile ?? contact?.whatsapp_number, showFullContact, "mobile")}
          />
          {contact?.secondary_mobile ? (
            <ContactRow label="Alt mobile" value={formatContactValue(contact.secondary_mobile, showFullContact, "mobile")} />
          ) : null}
        </dl>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Folder</p>
            <FolderPicker
              folders={folders}
              value={row.folder_id}
              onChange={(next) => onCommit({ folder_id: next })}
              onFolderCreated={onFolderCreated}
              canCreate={!!canManagePipelineTaxonomy}
            />
            {canManagePipelineTaxonomy ? (
              <p className="text-[11px] text-neutral-500">Type a new folder name here to create it instantly.</p>
            ) : null}
          </div>
          <div className="grid gap-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Category</p>
            {/* Combobox replaces a free-text datalist input — every category
                the user adopts becomes a suggestion for the next row, which
                stops accidental typos accumulating as ghost categories. */}
            <Combobox
              key={`cat-${row.id}-${row.pipeline_category || "General"}`}
              name={`pipeline_category_${row.id}`}
              options={categories}
              defaultValue={row.pipeline_category || "General"}
              placeholder="General"
              allowCreate
              onCommit={(value) => {
                const next = value.trim() || "General";
                if (next !== (row.pipeline_category || "General")) {
                  onCommit({ pipeline_category: next });
                }
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[#e6ebdc] bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Working notes and labels</p>
        <div className="mt-3">
          <LazyCommentThread
            quoteId={row.id}
            currentUser={currentUser}
            legacyNote={row.pipeline_comment}
          />
        </div>
        {rowErrors?.[row.id] ? (
          <p className="mt-2 text-[11px] font-bold text-[#b42318]">{rowErrors[row.id]}</p>
        ) : null}

        <div className="mt-4 border-t border-[#eef1e7] pt-4">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Quick labels</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["hot", "warm", "cold"] as const).map((value) => (
              <QuickLabelButton
                key={value}
                active={temperature === value}
                tone={value === "hot" ? "red" : value === "warm" ? "amber" : "green"}
                onClick={() =>
                  onCommit({
                    tags: setExclusiveNormalizedTag(row.tags, ["hot", "warm", "cold"], temperature === value ? null : value)
                  })
                }
              >
                {value}
              </QuickLabelButton>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "Callback", value: "callback", tone: "amber" as const },
              { label: "Docs pending", value: "docs pending", tone: "amber" as const },
              { label: "Site visit", value: "site visit", tone: "green" as const }
            ].map((tag) => (
              <QuickLabelButton
                key={tag.value}
                active={(row.tags ?? []).some((item) => normalizeTagName(item) === tag.value)}
                tone={tag.tone}
                onClick={() => onCommit({ tags: toggleNormalizedTag(row.tags, tag.value) })}
              >
                {tag.label}
              </QuickLabelButton>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">All labels</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(row.tags ?? []).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onCommit({ tags: (row.tags ?? []).filter((item) => normalizeTagName(item) !== normalizeTagName(tag)) })}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
              >
                {displayTag(tag, tagLabelMap)}
                <span className="text-neutral-400">×</span>
              </button>
            ))}
            {!row.tags?.length ? <span className="text-[11px] text-neutral-400">No tags yet</span> : null}
          </div>
          <select
            className="focus-ring mt-2 min-h-9 w-full rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-xs text-black"
            value={tagDraft}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onTagDraftChange("");
              if (!value) return;
              const existing = new Set((row.tags ?? []).map((tag) => normalizeTagName(tag)));
              if (existing.has(value)) return;
              onCommit({ tags: [...(row.tags ?? []), value] });
            }}
          >
            <option value="">Add tag</option>
            {groupedTags.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.tags.map((tag) => (
                  <option key={tag.id} value={normalizeTagName(tag.name)}>{tag.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-md border border-[#e6ebdc] bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Email activity</p>
        <div className="mt-3 space-y-2">
          {row.email_events.length ? (
            row.email_events.map((event) => (
              <div key={event.id} className="rounded-md border border-[#eef1e7] bg-[#fbfcf8] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={emailStatusTone(event.status)}>{event.status.replaceAll("_", " ")}</StatusPill>
                  <span className="text-[10px] text-neutral-500">
                    {formatDateTime(event.failed_at || event.opened_at || event.sent_at)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">{event.recipient_email || "No recipient"}</p>
                <p className="mt-0.5 text-xs text-neutral-700">{event.subject || "No subject"}</p>
                {event.failure_reason ? (
                  <p className="mt-1 text-[11px] font-bold text-[#b42318]">{event.failure_reason}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-xs text-neutral-500">No email activity yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-bold text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-800">{value}</dd>
    </div>
  );
}

function MetaPill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-bold",
        muted ? "border-[#e5e7eb] bg-[#f8f8f8] text-neutral-500" : "border-[#e6ebdc] bg-[#f8f9f4] text-neutral-600"
      )}
    >
      {children}
    </span>
  );
}

function StatePill({
  children,
  tone
}: {
  children: React.ReactNode;
  tone: "red" | "amber" | "green";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        tone === "red"
          ? "bg-[#fff0ed] text-[#b42318]"
          : tone === "amber"
            ? "bg-[#fff7df] text-[#7a5200]"
            : "bg-[#edf7df] text-[#47651d]"
      )}
    >
      {children}
    </span>
  );
}

function TemperaturePill({ value }: { value: "hot" | "warm" | "cold" }) {
  return <StatePill tone={value === "hot" ? "red" : value === "warm" ? "amber" : "green"}>{value}</StatePill>;
}

function QuickLabelButton({
  children,
  active,
  tone,
  onClick
}: {
  children: React.ReactNode;
  active: boolean;
  tone: "red" | "amber" | "green";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring rounded-full border px-3 py-1 text-[11px] font-bold transition",
        active
          ? tone === "red"
            ? "border-[#f3b9b0] bg-[#fff0ed] text-[#b42318]"
            : tone === "amber"
              ? "border-[#f2d087] bg-[#fff7df] text-[#7a5200]"
              : "border-[#bfd99c] bg-[#edf7df] text-[#47651d]"
          : "border-[#d9ded1] bg-white text-neutral-700 hover:bg-[#eef2e6]"
      )}
    >
      {children}
    </button>
  );
}

function describeLeadHealth(status: string, tags: string[] | null, followupDate: string | null) {
  const bucket = followupBucketFor(followupDate);
  if (bucket === "overdue") {
    return { label: "Action now", helper: "This lead has a past-due follow-up. Bring it back to the top of the queue.", tone: "red" as const };
  }
  if (bucket === "today") {
    return { label: "Today", helper: "A follow-up is scheduled for today, so this is part of the current working set.", tone: "amber" as const };
  }
  if (!followupDate) {
    return { label: "Schedule next", helper: "There is no next follow-up date yet. Set one so the lead does not go cold.", tone: "amber" as const };
  }
  if (isHotLead({ status, tags })) {
    return { label: "Hot", helper: "This lead is in play. Keep momentum with a clearly dated next step.", tone: "red" as const };
  }
  return { label: "On track", helper: "A next step is already scheduled, so this lead is under control.", tone: "green" as const };
}

function sortQuotes(quotes: PipelineListQuote[], { key, dir }: { key: SortKey; dir: "asc" | "desc" }) {
  const items = [...quotes];
  const safeDate = (value: string | null) => (value ? new Date(value).getTime() : 0);
  const sign = dir === "asc" ? 1 : -1;

  return items.sort((a, b) => {
    switch (key) {
      case "followup":
        return sign * (safeDate(a.followup_date) - safeDate(b.followup_date));
      case "amount":
        return sign * (a.total_amount - b.total_amount);
      case "client":
        return sign * (a.clients?.name ?? "").localeCompare(b.clients?.name ?? "");
      case "recent":
      default:
        return sign * (safeDate(a.sent_date) - safeDate(b.sent_date));
    }
  });
}

function defaultDir(key: SortKey): "asc" | "desc" {
  // Follow-up is most useful soonest-first; amount and recent are most useful
  // largest/newest first.
  return key === "followup" ? "asc" : "desc";
}

function groupTags(tags: TagOption[]) {
  const grouped = tags.reduce<Record<string, TagOption[]>>((groups, tag) => {
    const category = tag.category_name || "General";
    groups[category] = [...(groups[category] ?? []), tag];
    return groups;
  }, {});

  return Object.entries(grouped)
    .map(([category, items]) => ({ category, tags: items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function emailStatusTone(status: string) {
  if (status === "failed") return "red";
  if (status === "opened" || status === "clicked") return "green";
  if (status === "sent") return "black";
  return "muted";
}

function formatContactValue(value: string | null | undefined, showFullContact: boolean, type: "email" | "mobile") {
  if (!value) return "Not set";
  if (showFullContact) return value;
  return type === "email" ? maskEmail(value) : maskMobile(value);
}

function formatServiceRequested(services: string[]) {
  if (!services.length) return "Service not set";
  if (services.length <= 2) return services.join(", ");
  return `${services[0]}, ${services[1]} +${services.length - 2} more`;
}
