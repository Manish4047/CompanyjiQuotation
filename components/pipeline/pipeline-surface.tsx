"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowUpRight, CalendarClock, CalendarDays, Flame, Folder, LayoutGrid, Link2, List, Search, Target, UserRound } from "lucide-react";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PipelineList } from "@/components/pipeline/pipeline-list";
import { savePipelineRow, type PipelineRowInput } from "@/app/(app)/pipeline/actions";
import { isHotLead, normalizeTagName } from "@/lib/pipeline-taxonomy";
import {
  comparePipelinePriority,
  followupBucketFor,
  isPipelineStalled,
  needsLeadOwner,
  pipelineOwnerName,
  pipelinePlaybook,
  pipelineStatusLabel,
  type PipelineSourceLead
} from "@/lib/pipeline-insights";
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

export type PipelineQuoteRow = {
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

const VIEW_STORAGE_KEY = "companyji.pipeline.view";
const FILTER_STORAGE_KEY = "companyji.pipeline.quickfilter";

type QuickFilter =
  | "all"
  | "overdue"
  | "today"
  | "this_week"
  | "hot"
  | "stalled"
  | "unowned"
  | "no_followup"
  | "unfiled"
  | string; // string for "folder:<id>"

type PipelineSurfaceProps = {
  initialQuotes: PipelineQuoteRow[];
  folders: FolderOption[];
  tags: TagOption[];
  categories: string[];
  showFullContact: boolean;
  /** Current viewer — needed so the comment thread can stamp authorship. */
  currentUser: { id: string; full_name: string; email: string };
  /** True if the viewer can create folders/tag categories inline. */
  canManagePipelineTaxonomy?: boolean;
};

/**
 * Pipeline shell that owns row state, autosave, and chooses between Board and
 * List view. Both views read the same data and share the same commit pipeline
 * so a status change in one view is reflected in the other instantly.
 */
export function PipelineSurface({
  initialQuotes,
  folders: initialFolders,
  tags,
  categories,
  showFullContact,
  currentUser,
  canManagePipelineTaxonomy
}: PipelineSurfaceProps) {
  const [rows, setRows] = useState(initialQuotes);
  // Folders are owned by the surface so newly created folders from the inline
  // picker immediately become available in every row's picker and in the
  // quick-filter folder dropdown — no page refresh needed.
  const [folders, setFolders] = useState(initialFolders);
  const [view, setView] = useState<"board" | "list">("board");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleFolderCreated(folder: { id: string; name: string }) {
    setFolders((current) => {
      if (current.some((existing) => existing.id === folder.id)) return current;
      return [...current, folder].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // Hydrate view preference + quick filter from localStorage AFTER mount to
  // avoid SSR/CSR mismatch. SSR always renders the default ("board" / "all").
  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (storedView === "board" || storedView === "list") setView(storedView);
      const storedFilter = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (storedFilter) setQuickFilter(storedFilter as QuickFilter);
    } catch {
      // localStorage may be unavailable (privacy mode / SSR). Ignore.
    }
  }, []);

  function persistView(next: "board" | "list") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function persistFilter(next: QuickFilter) {
    setQuickFilter(next);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function commitRow(
    quoteId: string,
    patch: Partial<{
      status: string;
      folder_id: string | null;
      pipeline_category: string;
      followup_date: string | null;
      pipeline_comment: string;
      tags: string[];
    }>
  ) {
    const previousRows = rows;
    const previousRow = previousRows.find((row) => row.id === quoteId);
    if (!previousRow) return;

    const nextRows = previousRows.map((row) =>
      row.id === quoteId
        ? {
            ...row,
            ...patch,
            tags: patch.tags ?? row.tags
          }
        : row
    );
    const nextRow = nextRows.find((row) => row.id === quoteId);
    if (!nextRow) return;

    setRows(nextRows);
    setRowErrors((current) => ({ ...current, [quoteId]: "" }));
    setSavingIds((current) => ({ ...current, [quoteId]: true }));

    startTransition(async () => {
      const result = await savePipelineRow({
        quoteId,
        status: normalizeStatus(nextRow.status),
        folder_id: nextRow.folder_id,
        pipeline_category: nextRow.pipeline_category || "General",
        followup_date: nextRow.followup_date,
        pipeline_comment: nextRow.pipeline_comment ?? "",
        tags: (nextRow.tags ?? []).map((tag) => normalizeTagName(tag))
      });

      if (!result.ok) {
        // Revert optimistic update on failure and surface a per-row error.
        setRows(previousRows);
        setRowErrors((current) => ({
          ...current,
          [quoteId]: result.message ?? "Could not save pipeline changes."
        }));
      }
      setSavingIds((current) => ({ ...current, [quoteId]: false }));
    });
  }

  const filteredRows = useMemo(() => {
    const quickFiltered = applyQuickFilter(rows, quickFilter);
    return applySearchFilter(quickFiltered, deferredSearchTerm);
  }, [rows, quickFilter, deferredSearchTerm]);

  const counts = useMemo(() => buildCounts(rows), [rows]);
  const focusRows = useMemo(() => [...filteredRows].sort(comparePipelinePriority).slice(0, 6), [filteredRows]);
  const folderNameMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);

  return (
    <div className="space-y-4">
      <SurfaceOverview counts={counts} activeFilter={quickFilter} onChange={persistFilter} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                placeholder="Search by name, mobile, email, quote, or service"
                className="focus-ring h-10 w-full rounded-md border border-[#d9ded1] bg-white pl-9 pr-3 text-sm text-black placeholder:text-neutral-400"
              />
            </label>
            <QuickFilters value={quickFilter} onChange={persistFilter} counts={counts} folders={folders} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-neutral-500">
              {filteredRows.length} matching {filteredRows.length === 1 ? "lead" : "leads"}
            </p>
            <ViewToggle value={view} onChange={persistView} />
          </div>
        </div>
      </div>

      <ActionStack rows={focusRows} />

      {view === "board" ? (
        <PipelineBoard
          quotes={filteredRows.map((row) => toBoardQuote(row, folderNameMap))}
          tags={tags}
          onStatusChange={(quoteId, nextStatus) => commitRow(quoteId, { status: nextStatus })}
          onFollowupChange={(quoteId, nextDate) => commitRow(quoteId, { followup_date: nextDate })}
          savingIds={savingIds}
        />
      ) : (
        <PipelineList
          quotes={filteredRows}
          folders={folders}
          tags={tags}
          categories={categories}
          showFullContact={showFullContact}
          savingIds={savingIds}
          rowErrors={rowErrors}
          onCommit={commitRow}
          currentUser={currentUser}
          canManagePipelineTaxonomy={canManagePipelineTaxonomy}
          onFolderCreated={handleFolderCreated}
        />
      )}
    </div>
  );
}

function SurfaceOverview({
  counts,
  activeFilter,
  onChange
}: {
  counts: ReturnType<typeof buildCounts>;
  activeFilter: QuickFilter;
  onChange: (next: QuickFilter) => void;
}) {
  const cards: Array<{
    filter: QuickFilter;
    label: string;
    count: number;
    helper: string;
    tone?: "red" | "amber" | "green";
    icon: React.ReactNode;
  }> = [
    {
      filter: "overdue",
      label: "Overdue",
      count: counts.overdue,
      helper: "Past-due follow-ups",
      tone: "red",
      icon: <AlertTriangle className="h-4 w-4" />
    },
    {
      filter: "today",
      label: "Due today",
      count: counts.today,
      helper: "Close the loop before day-end",
      tone: "amber",
      icon: <CalendarDays className="h-4 w-4" />
    },
    {
      filter: "stalled",
      label: "Stalled",
      count: counts.stalled,
      helper: "Viewed or negotiating, but not properly dated",
      tone: "red",
      icon: <Target className="h-4 w-4" />
    },
    {
      filter: "hot",
      label: "Hot leads",
      count: counts.hot,
      helper: "Negotiating or tagged hot",
      tone: "red",
      icon: <Flame className="h-4 w-4" />
    },
    {
      filter: "unowned",
      label: "Needs owner",
      count: counts.unowned,
      helper: "Linked lead exists but nobody owns the chase",
      tone: "amber",
      icon: <UserRound className="h-4 w-4" />
    },
    {
      filter: "no_followup",
      label: "No follow-up",
      count: counts.no_followup,
      helper: "Needs the next action date",
      tone: "amber",
      icon: <CalendarClock className="h-4 w-4" />
    },
    {
      filter: "unfiled",
      label: "Unfiled",
      count: counts.unfiled,
      helper: "Assign a folder for reporting",
      tone: "green",
      icon: <Folder className="h-4 w-4" />
    }
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <OverviewCard
          key={card.filter}
          active={activeFilter === card.filter}
          label={card.label}
          count={card.count}
          helper={card.helper}
          tone={card.tone}
          icon={card.icon}
          onClick={() => onChange(card.filter)}
        />
      ))}
    </div>
  );
}

function ActionStack({ rows }: { rows: PipelineQuoteRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="rounded-2xl border border-[#d9ded1] bg-[#f8f9f4] p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6a912f]">Today&apos;s Action Stack</p>
          <h2 className="mt-1 text-xl font-black text-black">The deals the team should touch first</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
            This queue prioritizes overdue follow-ups, live commercial deals without a dated next step, and quotes that
            still have no clear owner.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-600">
          <span className="rounded-full bg-white px-3 py-1">Top {rows.length}</span>
          <span className="rounded-full bg-white px-3 py-1">
            {rows.filter((row) => followupBucketFor(row.followup_date) === "overdue").length} overdue
          </span>
          <span className="rounded-full bg-white px-3 py-1">{rows.filter(isPipelineStalled).length} stalled</span>
          <span className="rounded-full bg-white px-3 py-1">{rows.filter((row) => needsLeadOwner(row.source_lead)).length} need owner</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {rows.map((row) => (
          <FocusCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function FocusCard({ row }: { row: PipelineQuoteRow }) {
  const play = pipelinePlaybook(row);
  const followupBucket = followupBucketFor(row.followup_date);
  const ownerName = pipelineOwnerName(row.source_lead);

  return (
    <article className="rounded-2xl border border-[#d9ded1] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <ToneFlag tone={play.tone}>{play.label}</ToneFlag>
        <div className="flex items-center gap-2">
          <a
            href={`/quotes/${row.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-[#d9ded1] bg-white px-2.5 py-1 text-[11px] font-bold text-black hover:bg-[#eef2e6]"
          >
            Quote
            <ArrowUpRight className="h-3 w-3" />
          </a>
          {row.source_lead?.id ? (
            <a
              href={`/leads?selected=${row.source_lead.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-[#d9ded1] bg-white px-2.5 py-1 text-[11px] font-bold text-black hover:bg-[#eef2e6]"
            >
              Lead
              <Link2 className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-lg font-black text-black">{row.clients?.name ?? "Client"}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
        <span>{row.quote_id_formatted}</span>
        <span>|</span>
        <span>{pipelineStatusLabel(row.status)}</span>
        {row.source_lead?.lead_code ? (
          <>
            <span>|</span>
            <span>{row.source_lead.lead_code}</span>
          </>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-neutral-700">{play.helper}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <MiniBadge icon={<Target className="h-3 w-3" />}>{followupBucket === "none" ? "No follow-up set" : `Follow-up ${followupBucket.replaceAll("_", " ")}`}</MiniBadge>
        <MiniBadge icon={<UserRound className="h-3 w-3" />}>{ownerName}</MiniBadge>
        {needsLeadOwner(row.source_lead) ? <MiniBadge tone="amber">Needs owner</MiniBadge> : null}
        {isHotLead({ status: row.status, tags: row.tags }) ? <MiniBadge tone="red">Hot deal</MiniBadge> : null}
      </div>
    </article>
  );
}

function QuickFilters({
  value,
  onChange,
  counts,
  folders
}: {
  value: QuickFilter;
  onChange: (next: QuickFilter) => void;
  counts: ReturnType<typeof buildCounts>;
  folders: FolderOption[];
}) {
  const isFolderFilter = typeof value === "string" && value.startsWith("folder:");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip active={value === "all"} onClick={() => onChange("all")} count={counts.all}>
        All
      </FilterChip>
      <FilterChip
        active={value === "overdue"}
        onClick={() => onChange("overdue")}
        count={counts.overdue}
        tone="red"
        icon={<AlertTriangle className="h-3 w-3" />}
      >
        Overdue
      </FilterChip>
      <FilterChip
        active={value === "today"}
        onClick={() => onChange("today")}
        count={counts.today}
        tone="amber"
        icon={<CalendarDays className="h-3 w-3" />}
      >
        Today
      </FilterChip>
      <FilterChip
        active={value === "this_week"}
        onClick={() => onChange("this_week")}
        count={counts.this_week}
        tone="green"
      >
        This week
      </FilterChip>
      <FilterChip active={value === "hot"} onClick={() => onChange("hot")} count={counts.hot} icon={<Flame className="h-3 w-3" />}>
        Hot leads
      </FilterChip>
      <FilterChip
        active={value === "stalled"}
        onClick={() => onChange("stalled")}
        count={counts.stalled}
        tone="red"
        icon={<Target className="h-3 w-3" />}
      >
        Stalled
      </FilterChip>
      <FilterChip
        active={value === "unowned"}
        onClick={() => onChange("unowned")}
        count={counts.unowned}
        tone="amber"
        icon={<UserRound className="h-3 w-3" />}
      >
        Needs owner
      </FilterChip>
      <FilterChip
        active={value === "no_followup"}
        onClick={() => onChange("no_followup")}
        count={counts.no_followup}
        tone="amber"
        icon={<CalendarClock className="h-3 w-3" />}
      >
        No follow-up
      </FilterChip>
      <FilterChip active={value === "unfiled"} onClick={() => onChange("unfiled")} count={counts.unfiled} icon={<Folder className="h-3 w-3" />}>
        Unfiled
      </FilterChip>

      {folders.length ? (
        <label className="ml-1 inline-flex items-center gap-2 text-xs text-neutral-500">
          <Folder className="h-3.5 w-3.5" />
          <select
            className="focus-ring min-h-9 rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-xs font-semibold text-black"
            value={isFolderFilter ? value : ""}
            onChange={(event) => {
              const next = event.currentTarget.value;
              onChange(next || "all");
            }}
          >
            <option value="">Folder…</option>
            {folders.map((folder) => (
              <option key={folder.id} value={`folder:${folder.id}`}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function OverviewCard({
  active,
  label,
  count,
  helper,
  tone,
  icon,
  onClick
}: {
  active: boolean;
  label: string;
  count: number;
  helper: string;
  tone?: "red" | "amber" | "green";
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring rounded-2xl border p-4 text-left transition",
        active ? "border-black bg-black text-white shadow-sm" : "border-[#d9ded1] bg-white text-black hover:border-[#a0ce4e]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-[11px] font-black uppercase tracking-[0.18em]", active ? "text-white/70" : "text-neutral-500")}>{label}</p>
          <p className="mt-2 text-3xl font-black leading-none">{count}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full",
            active
              ? "bg-white/10 text-white"
              : tone === "red"
                ? "bg-[#fff0ed] text-[#b42318]"
                : tone === "amber"
                  ? "bg-[#fff7df] text-[#7a5200]"
                  : tone === "green"
                    ? "bg-[#edf7df] text-[#47651d]"
                    : "bg-[#eef2e6] text-[#47651d]"
          )}
        >
          {icon}
        </span>
      </div>
      <p className={cn("mt-3 text-xs", active ? "text-white/75" : "text-neutral-600")}>{helper}</p>
    </button>
  );
}

function ToneFlag({
  tone,
  children
}: {
  tone: "red" | "amber" | "green" | "black" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide",
        tone === "red"
          ? "bg-[#fff0ed] text-[#b42318]"
          : tone === "amber"
            ? "bg-[#fff7df] text-[#7a5200]"
            : tone === "green"
              ? "bg-[#edf7df] text-[#47651d]"
              : tone === "black"
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600"
      )}
    >
      {children}
    </span>
  );
}

function MiniBadge({
  children,
  icon,
  tone
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "red" | "amber" | "green";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        tone === "red"
          ? "border-[#f3b9b0] bg-[#fff0ed] text-[#b42318]"
          : tone === "amber"
            ? "border-[#f2d087] bg-[#fff7df] text-[#7a5200]"
            : tone === "green"
              ? "border-[#bfd99c] bg-[#edf7df] text-[#47651d]"
              : "border-[#d9ded1] bg-white text-neutral-600"
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
  tone,
  icon
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  tone?: "red" | "amber" | "green";
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition",
        active
          ? "border-black bg-black text-white"
          : "border-[#d9ded1] bg-white text-neutral-700 hover:bg-[#eef2e6]"
      )}
    >
      {icon}
      <span>{children}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-black",
          active
            ? "bg-white/20 text-white"
            : tone === "red"
              ? "bg-[#fff0ed] text-[#b42318]"
              : tone === "amber"
                ? "bg-[#fff7df] text-[#7a5200]"
                : tone === "green"
                  ? "bg-[#edf7df] text-[#47651d]"
                  : "bg-neutral-100 text-neutral-600"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ViewToggle({ value, onChange }: { value: "board" | "list"; onChange: (next: "board" | "list") => void }) {
  return (
    <div className="inline-flex rounded-md border border-[#d9ded1] bg-white p-1 text-xs">
      <ToggleBtn active={value === "board"} onClick={() => onChange("board")} icon={<LayoutGrid className="h-3.5 w-3.5" />}>
        Board
      </ToggleBtn>
      <ToggleBtn active={value === "list"} onClick={() => onChange("list")} icon={<List className="h-3.5 w-3.5" />}>
        List
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-bold transition",
        active ? "bg-[#a0ce4e] text-black" : "text-neutral-600 hover:bg-[#eef2e6]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function applyQuickFilter(rows: PipelineQuoteRow[], filter: QuickFilter) {
  if (filter === "all") return rows;

  if (filter === "hot") {
    return rows.filter((row) => isHotLead({ status: row.status, tags: row.tags }));
  }

  if (filter === "stalled") {
    return rows.filter(isPipelineStalled);
  }

  if (filter === "unowned") {
    return rows.filter((row) => needsLeadOwner(row.source_lead));
  }

  if (filter === "no_followup") {
    return rows.filter((row) => !row.followup_date);
  }

  if (filter === "unfiled") {
    return rows.filter((row) => !row.folder_id);
  }

  if (filter.startsWith("folder:")) {
    const folderId = filter.split(":")[1] ?? "";
    return rows.filter((row) => row.folder_id === folderId);
  }

  return rows.filter((row) => {
    const bucket = followupBucketFor(row.followup_date);
    if (filter === "overdue") return bucket === "overdue";
    if (filter === "today") return bucket === "today";
    if (filter === "this_week") return bucket === "this_week" || bucket === "today";
    return true;
  });
}

function buildCounts(rows: PipelineQuoteRow[]) {
  let overdue = 0;
  let today = 0;
  let thisWeek = 0;
  let hot = 0;
  let stalled = 0;
  let unowned = 0;
  let noFollowup = 0;
  let unfiled = 0;
  for (const row of rows) {
    const bucket = followupBucketFor(row.followup_date);
    if (bucket === "overdue") overdue++;
    if (bucket === "today") today++;
    if (bucket === "this_week" || bucket === "today") thisWeek++;
    if (isHotLead({ status: row.status, tags: row.tags })) hot++;
    if (isPipelineStalled(row)) stalled++;
    if (needsLeadOwner(row.source_lead)) unowned++;
    if (!row.followup_date) noFollowup++;
    if (!row.folder_id) unfiled++;
  }
  return { all: rows.length, overdue, today, this_week: thisWeek, hot, stalled, unowned, no_followup: noFollowup, unfiled };
}

function applySearchFilter(rows: PipelineQuoteRow[], searchTerm: string) {
  const needle = searchTerm.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) => {
    const contact = row.clients?.contact_details;
    const haystack = [
      row.clients?.name,
      row.clients?.code,
      row.clients?.group_id,
      row.quote_id_formatted,
      row.source_lead?.lead_code,
      row.source_lead?.assigned_profile?.full_name,
      contact?.primary_email,
      contact?.secondary_email,
      contact?.primary_mobile,
      contact?.secondary_mobile,
      contact?.whatsapp_number,
      ...row.service_requested
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

function toBoardQuote(row: PipelineQuoteRow, folderNameMap: Map<string, string>) {
  return {
    id: row.id,
    quote_id_formatted: row.quote_id_formatted,
    status: row.status,
    currency_code: row.currency_code,
    total_amount: row.total_amount,
    sent_date: row.sent_date,
    last_opened: row.last_opened,
    open_count: row.open_count,
    followup_date: row.followup_date,
    tags: row.tags,
    folder_name: row.folder_id ? folderNameMap.get(row.folder_id) ?? null : null,
    pipeline_category: row.pipeline_category || "General",
    service_requested: row.service_requested,
    clients: row.clients ? { name: row.clients.name, code: row.clients.code } : null,
    source_lead: row.source_lead
  };
}

function normalizeStatus(value: string): PipelineRowInput["status"] {
  const valid = [
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
  return (valid as readonly string[]).includes(value) ? (value as PipelineRowInput["status"]) : "sent";
}
