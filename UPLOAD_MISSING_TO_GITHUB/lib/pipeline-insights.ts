import { isHotLead } from "@/lib/pipeline-taxonomy";

export type PipelineFollowupBucket = "overdue" | "today" | "this_week" | "future" | "none";

export type PipelineSourceLead = {
  id: string;
  lead_code: string | null;
  status: string | null;
  assigned_to: string | null;
  assigned_profile: { full_name: string | null } | null;
} | null;

export type PipelineInsightRow = {
  status: string;
  followup_date: string | null;
  tags: string[] | null;
  open_count: number;
  sent_date: string | null;
  last_opened?: string | null;
  source_lead?: PipelineSourceLead;
};

export type PipelinePlay = {
  label: string;
  helper: string;
  tone: "red" | "amber" | "green" | "black" | "muted";
  priority: number;
};

const CLOSED_PIPELINE_STATUSES = new Set(["accepted", "lost", "lost_nurture", "expired", "dormant", "spam", "superseded"]);

export function pipelineStatusLabel(status: string) {
  const labels: Record<string, string> = {
    sent: "Sent",
    viewed: "Viewed",
    negotiating: "Negotiating",
    refresh_requested: "Revision requested",
    accepted: "Won",
    expired: "Expired",
    lost: "Lost",
    lost_nurture: "Nurture later",
    dormant: "Dormant",
    spam: "Spam",
    superseded: "Superseded"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

export function isPipelineClosedStatus(status: string | null | undefined) {
  return CLOSED_PIPELINE_STATUSES.has(String(status ?? ""));
}

export function followupBucketFor(value: string | null) {
  if (!value) return "none" as const;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "none" as const;

  const today = startOfDay(new Date());
  const targetDay = startOfDay(target);
  const diffMs = targetDay.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return "overdue" as const;
  if (diffDays === 0) return "today" as const;
  if (diffDays <= 7) return "this_week" as const;
  return "future" as const;
}

export function followupLabelFor(value: string | null, bucket = followupBucketFor(value)) {
  if (bucket === "none") return "Set follow-up";

  const target = new Date(value as string);
  const today = startOfDay(new Date());
  const targetDay = startOfDay(target);
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (bucket === "overdue") {
    const abs = Math.abs(diffDays);
    return `Overdue | ${abs}d`;
  }
  if (bucket === "today") return "Today";
  if (bucket === "this_week") {
    if (diffDays === 1) return "Tomorrow";
    return `in ${diffDays}d | ${formatShortWeekday(target)}`;
  }
  return formatShortDate(target);
}

export function pipelineOwnerName(sourceLead: PipelineSourceLead) {
  const name = sourceLead?.assigned_profile?.full_name?.trim();
  if (name) return name;
  return sourceLead?.id ? "Unassigned" : "No linked lead";
}

export function needsLeadOwner(sourceLead: PipelineSourceLead) {
  return Boolean(sourceLead?.id) && !sourceLead?.assigned_to;
}

export function isPipelineStalled(row: Pick<PipelineInsightRow, "status" | "followup_date">) {
  const bucket = followupBucketFor(row.followup_date);
  const activeFollowThrough = row.status === "viewed" || row.status === "negotiating" || row.status === "refresh_requested";
  return activeFollowThrough && (bucket === "overdue" || bucket === "none");
}

export function pipelinePlaybook(row: PipelineInsightRow): PipelinePlay {
  const bucket = followupBucketFor(row.followup_date);
  const daysSinceSent = ageInDays(row.sent_date);

  if (row.status === "accepted") {
    return {
      label: "Move to onboarding",
      helper: "Commercial work is complete. Lock in paperwork, payment, and service kickoff.",
      tone: "green",
      priority: 10
    };
  }

  if (row.status === "lost_nurture" || row.status === "dormant") {
    return {
      label: "Park in nurture",
      helper: "This is closed for now. Keep only a low-frequency re-engagement step if timing may reopen it later.",
      tone: "muted",
      priority: 4
    };
  }

  if (row.status === "lost" || row.status === "expired" || row.status === "spam" || row.status === "superseded") {
    return {
      label: "Closed out",
      helper: "No active chase is needed unless you intentionally reopen the opportunity.",
      tone: "muted",
      priority: 2
    };
  }

  if (bucket === "overdue") {
    return {
      label: "Call now",
      helper: "The promised next step is overdue. Bring this quote back into today's queue and capture the outcome.",
      tone: "red",
      priority: 100
    };
  }

  if (row.status === "refresh_requested" && bucket === "none") {
    return {
      label: "Book revision follow-up",
      helper: "A revision was requested, but there is no dated comeback. Set a review date before momentum drops.",
      tone: "red",
      priority: 96
    };
  }

  if (row.status === "negotiating" && bucket === "none") {
    return {
      label: "Schedule negotiation step",
      helper: "This deal is in live discussion but missing a dated next move. Put the next call on the calendar now.",
      tone: "red",
      priority: 94
    };
  }

  if (row.status === "viewed" && bucket === "none") {
    return {
      label: "Call while interest is fresh",
      helper: "The quote has already been opened. Use that signal and schedule the next touch before attention fades.",
      tone: "red",
      priority: 92
    };
  }

  if (needsLeadOwner(row.source_lead ?? null)) {
    return {
      label: "Assign an owner",
      helper: "This quote is linked to a lead, but nobody owns the follow-through yet.",
      tone: "amber",
      priority: 89
    };
  }

  if (row.status === "sent" && row.open_count === 0 && daysSinceSent >= 2) {
    return {
      label: "Confirm receipt",
      helper: "The quote was sent but still has no engagement signal. Re-share it or check whether the client received it.",
      tone: "amber",
      priority: 87
    };
  }

  if (bucket === "today") {
    return {
      label: "Close the loop today",
      helper: "A follow-up is due today. Capture the outcome before day-end and set the next step immediately.",
      tone: "amber",
      priority: 86
    };
  }

  if (isHotLead({ status: row.status, tags: row.tags })) {
    return {
      label: "Protect momentum",
      helper: "This is a hot deal. Keep the next contact specific, dated, and hard to miss.",
      tone: "amber",
      priority: 84
    };
  }

  if (row.status === "refresh_requested") {
    return {
      label: "Send revision and review",
      helper: "The client asked for changes. Keep the revised quote tied to a review date and decision call.",
      tone: "black",
      priority: 80
    };
  }

  if (row.status === "negotiating") {
    return {
      label: "Keep commercial pressure",
      helper: "Stay close to pricing, approvals, and objections until the client decides.",
      tone: "black",
      priority: 78
    };
  }

  if (row.status === "viewed") {
    return {
      label: "Use the read signal",
      helper: "The client has engaged with the quote. Reference what they saw and move toward a decision call.",
      tone: "black",
      priority: 74
    };
  }

  if (row.status === "sent") {
    return {
      label: "Nudge after sending",
      helper: "Fresh quotes still need a scheduled callback so they do not become silent pending items.",
      tone: "green",
      priority: 70
    };
  }

  return {
    label: "Review",
    helper: "Keep this quote moving with a clearly dated next step.",
    tone: "green",
    priority: 60
  };
}

export function comparePipelinePriority<T extends PipelineInsightRow>(left: T, right: T) {
  const priorityDelta = pipelinePlaybook(right).priority - pipelinePlaybook(left).priority;
  if (priorityDelta !== 0) return priorityDelta;

  const leftHot = Number(isHotLead({ status: left.status, tags: left.tags }));
  const rightHot = Number(isHotLead({ status: right.status, tags: right.tags }));
  if (leftHot !== rightHot) return rightHot - leftHot;

  return safeDate(right.sent_date) - safeDate(left.sent_date);
}

function safeDate(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function ageInDays(value: string | null | undefined) {
  if (!value) return 0;
  const time = safeDate(value);
  if (!time) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatShortWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
}
