import type { AppRole } from "@/lib/auth/roles";

export const leadStatuses = ["new", "follow_up", "qualified", "quotation_sent", "nurture", "converted", "lost"] as const;
export const manualLeadStatuses = ["new", "follow_up", "qualified", "nurture", "converted", "lost"] as const;
export const activeLeadStatuses = ["new", "follow_up", "qualified", "quotation_sent", "nurture"] as const;
export const leadFunnelStatuses = ["new", "follow_up", "qualified", "nurture"] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const leadSources = ["Cold Call", "Meta", "Google Form", "WhatsApp", "Referral", "Website", "Manual"] as const;

export function leadStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "New",
    follow_up: "Contacting",
    qualified: "Qualified",
    quotation_sent: "In Quote Pipeline",
    nurture: "Nurture",
    converted: "Converted",
    lost: "Lost"
  };

  return labels[status] ?? sentenceCase(status);
}

export function leadStatusTone(status: string): "green" | "black" | "amber" | "red" | "muted" {
  if (status === "converted") return "green";
  if (status === "lost") return "red";
  if (status === "follow_up") return "amber";
  if (status === "quotation_sent") return "black";
  if (status === "qualified") return "black";
  return "muted";
}

export function isClosedLeadStatus(status: string | null | undefined) {
  return status === "converted" || status === "lost";
}

export function canViewAllLeads(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canManageLeadAssignments(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canUseWhatsAppInbox(role: AppRole) {
  return role === "admin" || role === "manager" || role === "sales" || role === "executive" || role === "shared_office";
}

export function canAccessLeadRecord(
  profile: { id: string; role: AppRole },
  lead: { assigned_to?: string | null; created_by?: string | null }
) {
  return canViewAllLeads(profile.role) || lead.assigned_to === profile.id || lead.created_by === profile.id;
}

export function canAccessConversationRecord(
  profile: { id: string; role: AppRole },
  conversation: { assigned_to?: string | null; created_by?: string | null; lead_assigned_to?: string | null; lead_created_by?: string | null }
) {
  return (
    canViewAllLeads(profile.role) ||
    conversation.assigned_to === profile.id ||
    conversation.created_by === profile.id ||
    conversation.lead_assigned_to === profile.id ||
    conversation.lead_created_by === profile.id
  );
}

export function leadFeatureWarningFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("relation") && lower.includes("leads")) {
    return "Leads tables are missing. Run migration 0015_leads_crm_v1.sql in Supabase SQL Editor.";
  }

  if (lower.includes("relation") && lower.includes("whatsapp_conversations")) {
    return "WhatsApp inbox tables are missing. Run migration 0015_leads_crm_v1.sql in Supabase SQL Editor.";
  }

  if ((lower.includes("relation") && lower.includes("lead_ingest_events")) || lower.includes("source_lead_id")) {
    return "Lead intake tables are missing. Run migration 0016_lead_intake_pipeline.sql in Supabase SQL Editor.";
  }

  return null;
}

export function formatLeadDateTime(value: string | null | undefined) {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function reminderState(dueAt: string | null | undefined) {
  if (!dueAt) return { label: "No reminder", tone: "muted" as const };

  const now = Date.now();
  const time = new Date(dueAt).getTime();
  if (Number.isNaN(time)) return { label: "Invalid date", tone: "red" as const };

  if (time <= now) return { label: "Due now", tone: "red" as const };
  if (time - now <= 2 * 60 * 60 * 1000) return { label: "Due soon", tone: "amber" as const };
  return { label: "Scheduled", tone: "muted" as const };
}

export function splitLeadTags(value: string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function sentenceCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
