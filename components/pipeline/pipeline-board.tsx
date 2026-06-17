"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { ArrowUpRight, GripVertical } from "lucide-react";
import { FollowupChip, followupBucketFor } from "@/components/pipeline/followup-chip";
import { StatusPill } from "@/components/ui/status-pill";
import { buildTagLabelMap, displayTag, isHotLead, leadTemperatureForTags, normalizeTagName } from "@/lib/pipeline-taxonomy";
import { comparePipelinePriority, isPipelineStalled, pipelineOwnerName, pipelinePlaybook, pipelineStatusLabel, type PipelineSourceLead } from "@/lib/pipeline-insights";
import { formatCurrency, formatDate, quoteStatusTone } from "@/lib/utils";
import { cn } from "@/lib/utils";

type PipelineBoardQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  currency_code: string;
  total_amount: number;
  sent_date: string | null;
  last_opened: string | null;
  open_count: number;
  followup_date: string | null;
  tags: string[] | null;
  folder_name: string | null;
  pipeline_category: string;
  service_requested: string[];
  clients: { name: string; code: string | null } | null;
  source_lead: PipelineSourceLead;
};

type TagOption = { id: string; name: string; category_name?: string | null };

/**
 * Status stages used by the board. Each stage covers one or more raw quote
 * statuses; the *default* status is what gets written when a card is dropped
 * into the column.
 *
 * Why group statuses: the raw status list has 11 values (sent, viewed,
 * negotiating, refresh_requested, expired, accepted, lost, lost_nurture,
 * dormant, spam, superseded). Showing 11 columns is unworkable. Five
 * column-stages give a real bird's-eye view; the granular status is still
 * visible on each card via the pill, and editable in the list view.
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  { id: "sent", label: "Fresh quotes", helper: "Recently sent and waiting for first traction.", defaultStatus: "sent", statuses: ["sent"], tone: "muted" },
  { id: "viewed", label: "Engaged", helper: "Client has opened the quote and should be actively followed.", defaultStatus: "viewed", statuses: ["viewed"], tone: "muted" },
  {
    id: "negotiating",
    label: "Commercial chase",
    helper: "Negotiation, pricing, and revision work that must keep moving.",
    defaultStatus: "negotiating",
    statuses: ["negotiating", "refresh_requested"],
    tone: "black"
  },
  { id: "won", label: "Closed won", helper: "Commercially won and ready for execution handoff.", defaultStatus: "accepted", statuses: ["accepted"], tone: "green" },
  {
    id: "lost",
    label: "Closed out",
    helper: "Lost, expired, or intentionally parked deals.",
    defaultStatus: "lost",
    statuses: ["lost", "lost_nurture", "expired", "dormant", "spam", "superseded"],
    tone: "red"
  }
];

type PipelineStage = {
  id: string;
  label: string;
  helper: string;
  defaultStatus: string;
  statuses: string[];
  tone: "muted" | "black" | "green" | "red";
};

type PipelineBoardProps = {
  quotes: PipelineBoardQuote[];
  tags: TagOption[];
  /** Called when a card is dropped into a different stage. Returns the new raw status. */
  onStatusChange: (quoteId: string, nextStatus: string) => void;
  /** Called when a follow-up date is edited from the card chip. */
  onFollowupChange: (quoteId: string, nextDate: string | null) => void;
  /** Optional saving indicator per quote. */
  savingIds?: Record<string, boolean>;
};

export function PipelineBoard({
  quotes,
  tags,
  onStatusChange,
  onFollowupChange,
  savingIds
}: PipelineBoardProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid hijacking clicks on the chip / link inside the card.
      activationConstraint: { distance: 6 }
    })
  );
  const tagLabelMap = useMemo(() => buildTagLabelMap(tags), [tags]);
  const grouped = useMemo(() => groupByStage(quotes), [quotes]);
  const activeQuote = activeDragId ? quotes.find((quote) => quote.id === activeDragId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    if (!event.over) return;
    const quoteId = String(event.active.id);
    const stageId = String(event.over.id);
    const stage = PIPELINE_STAGES.find((item) => item.id === stageId);
    if (!stage) return;

    const quote = quotes.find((item) => item.id === quoteId);
    if (!quote) return;
    if (stage.statuses.includes(quote.status)) return; // already in this stage

    onStatusChange(quoteId, stage.defaultStatus);
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-3 [scrollbar-gutter:stable]">
        <div className="flex min-w-[980px] gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const stageQuotes = grouped[stage.id] ?? [];
            const total = stageQuotes.reduce((sum, quote) => sum + (quote.total_amount || 0), 0);
            const currency = stageQuotes[0]?.currency_code;
            const overdueCount = stageQuotes.filter((quote) => followupBucketFor(quote.followup_date) === "overdue").length;
            const hotCount = stageQuotes.filter((quote) => isHotLead({ status: quote.status, tags: quote.tags })).length;

            return (
              <Column
                key={stage.id}
                stage={stage}
                count={stageQuotes.length}
                totalLabel={total ? formatCurrency(total, currency) : null}
                overdueCount={overdueCount}
                hotCount={hotCount}
              >
                {stageQuotes.map((quote) => (
                  <Card
                    key={quote.id}
                    quote={quote}
                    tagLabelMap={tagLabelMap}
                    saving={savingIds?.[quote.id]}
                    onFollowupChange={(next) => onFollowupChange(quote.id, next)}
                  />
                ))}
                {stageQuotes.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#d9ded1] p-4 text-center text-xs text-neutral-400">
                    Drop a lead here
                  </div>
                ) : null}
              </Column>
            );
          })}
        </div>
      </div>

      {/* DragOverlay keeps the dragged card visible above the columns while
          dragging, so the user always sees what they're moving. */}
      <DragOverlay>
        {activeQuote ? (
          <div className="w-72 rotate-1">
            <CardPresenter quote={activeQuote} tagLabelMap={tagLabelMap} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  count,
  totalLabel,
  overdueCount,
  hotCount,
  children
}: {
  stage: PipelineStage;
  count: number;
  totalLabel: string | null;
  overdueCount: number;
  hotCount: number;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-[#f8f9f4] transition",
        isOver ? "border-[#a0ce4e] ring-2 ring-[#a0ce4e]/40" : "border-[#e6ebdc]"
      )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[#e6ebdc] bg-white px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("inline-block h-2 w-2 rounded-full", dotClass(stage.tone))} />
              <h3 className="text-sm font-black text-black">{stage.label}</h3>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-600">{count}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-neutral-500">{stage.helper}</p>
          </div>
          <div className="text-right">
            {totalLabel ? <p className="text-[11px] font-bold text-neutral-500">{totalLabel}</p> : null}
            <p className="mt-1 text-[10px] font-semibold text-neutral-400">
              {overdueCount} overdue | {hotCount} hot
            </p>
          </div>
        </header>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </section>
  );
}

function Card({
  quote,
  tagLabelMap,
  saving,
  onFollowupChange
}: {
  quote: PipelineBoardQuote;
  tagLabelMap: Map<string, string>;
  saving?: boolean;
  onFollowupChange: (next: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: quote.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-md border bg-white shadow-sm transition",
        isDragging ? "opacity-0" : "border-[#e6ebdc] hover:border-[#a0ce4e]"
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-label="Drag lead"
          className="focus-ring -ml-1 mt-0.5 cursor-grab rounded p-0.5 text-neutral-300 hover:bg-[#eef2e6] hover:text-neutral-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <CardPresenter
          quote={quote}
          tagLabelMap={tagLabelMap}
          onFollowupChange={onFollowupChange}
          saving={saving}
        />
      </div>
    </div>
  );
}

function CardPresenter({
  quote,
  tagLabelMap,
  dragging,
  saving,
  onFollowupChange
}: {
  quote: PipelineBoardQuote;
  tagLabelMap: Map<string, string>;
  dragging?: boolean;
  saving?: boolean;
  onFollowupChange?: (next: string | null) => void;
}) {
  const temperature = leadTemperatureForTags(quote.tags);
  const nonTemperatureTags = (quote.tags ?? []).filter((tag) => !["hot", "warm", "cold"].includes(normalizeTagName(tag)));
  const tags = nonTemperatureTags.slice(0, 2);
  const overflowCount = Math.max(0, nonTemperatureTags.length - tags.length);
  const bucket = followupBucketFor(quote.followup_date);
  const play = pipelinePlaybook(quote);
  const ownerName = pipelineOwnerName(quote.source_lead);
  const stalled = isPipelineStalled(quote);

  return (
    <div className={cn("min-w-0 flex-1 space-y-2", dragging && "rounded-md border border-[#a0ce4e] bg-white p-3 shadow-lg")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-black">{quote.clients?.name ?? "Client"}</p>
          {quote.clients?.code ? <p className="truncate text-[11px] text-neutral-500">Client {quote.clients.code}</p> : null}
          <p className="line-clamp-2 text-[11px] text-neutral-500">
            {formatServiceRequested(quote.service_requested)}
          </p>
          {quote.source_lead?.id ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-neutral-500">
              <Link href={`/leads?selected=${quote.source_lead.id}`} className="hover:text-black">
                {quote.source_lead.lead_code ?? "Open lead"}
              </Link>
              <span>|</span>
              <span>{ownerName}</span>
            </div>
          ) : (
            <p className="mt-1 text-[10px] font-semibold text-neutral-400">Standalone quote</p>
          )}
        </div>
        <Link
          href={`/quotes/${quote.id}`}
          className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 opacity-0 transition group-hover:opacity-100 hover:bg-[#eef2e6] hover:text-neutral-700"
          aria-label="Open quote"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill tone={quoteStatusTone(quote.status)}>{pipelineStatusLabel(quote.status)}</StatusPill>
        {temperature ? <TemperaturePill value={temperature} /> : null}
        <span className="text-xs font-black text-black">{formatCurrency(quote.total_amount, quote.currency_code)}</span>
      </div>

      {quote.folder_name || quote.pipeline_category ? (
        <div className="flex flex-wrap gap-1">
          {quote.folder_name ? <MetaPill>{quote.folder_name}</MetaPill> : <MetaPill muted>Unfiled</MetaPill>}
          <MetaPill>{quote.pipeline_category}</MetaPill>
          {stalled ? <MetaPill alert>Stalled</MetaPill> : null}
          {quote.source_lead?.id && !quote.source_lead.assigned_to ? <MetaPill alert>Needs owner</MetaPill> : null}
        </div>
      ) : null}

      <p className="text-[11px] font-semibold leading-5 text-neutral-700">
        {play.label}: {play.helper}
      </p>

      <div className={cn("flex flex-wrap items-center gap-1.5", bucket === "overdue" && "animate-pulse-once")}>
        {onFollowupChange ? (
          <FollowupChip value={quote.followup_date} onChange={onFollowupChange} size="sm" />
        ) : (
          <span className="text-[11px] text-neutral-500">{formatDate(quote.followup_date)}</span>
        )}
        {saving ? <span className="text-[10px] font-bold text-neutral-400">Saving...</span> : null}
      </div>

      {tags.length ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
              {displayTag(tag, tagLabelMap)}
            </span>
          ))}
          {overflowCount > 0 ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
              +{overflowCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{quote.quote_id_formatted}</p>
    </div>
  );
}

function groupByStage(quotes: PipelineBoardQuote[]) {
  const stageOf: Record<string, PipelineBoardQuote[]> = {};
  for (const stage of PIPELINE_STAGES) stageOf[stage.id] = [];

  for (const quote of quotes) {
    const stage = PIPELINE_STAGES.find((item) => item.statuses.includes(quote.status));
    if (stage) {
      stageOf[stage.id].push(quote);
    } else {
      // Unknown status (e.g. legacy "draft"): show in "Sent" as a safe default
      // so the card isn't silently dropped from the board.
      stageOf.sent.push(quote);
    }
  }

  for (const stage of PIPELINE_STAGES) {
    stageOf[stage.id] = [...stageOf[stage.id]].sort(compareBoardQuotes);
  }

  return stageOf;
}

function compareBoardQuotes(a: PipelineBoardQuote, b: PipelineBoardQuote) {
  const priorityDelta = comparePipelinePriority(a, b);
  if (priorityDelta !== 0) return priorityDelta;
  return b.total_amount - a.total_amount;
}

function TemperaturePill({ value }: { value: "hot" | "warm" | "cold" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        value === "hot"
          ? "bg-[#fff0ed] text-[#b42318]"
          : value === "warm"
            ? "bg-[#fff7df] text-[#7a5200]"
            : "bg-[#eef2e6] text-[#47651d]"
      )}
    >
      {value}
    </span>
  );
}

function MetaPill({ children, muted, alert }: { children: React.ReactNode; muted?: boolean; alert?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-bold",
        alert
          ? "border-[#f2d087] bg-[#fff7df] text-[#7a5200]"
          : muted
            ? "border-[#e5e7eb] bg-[#f8f8f8] text-neutral-500"
            : "border-[#e6ebdc] bg-[#f8f9f4] text-neutral-600"
      )}
    >
      {children}
    </span>
  );
}

function dotClass(tone: PipelineStage["tone"]) {
  switch (tone) {
    case "green":
      return "bg-[#6a912f]";
    case "red":
      return "bg-[#b42318]";
    case "black":
      return "bg-black";
    case "muted":
    default:
      return "bg-neutral-400";
  }
}

function formatServiceRequested(services: string[]) {
  if (!services.length) return "Service not set";
  if (services.length === 1) return services[0];
  if (services.length === 2) return services.join(", ");
  return `${services[0]}, ${services[1]} +${services.length - 2} more`;
}
