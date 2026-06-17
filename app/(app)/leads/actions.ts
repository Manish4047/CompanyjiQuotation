"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessLeadRecord,
  canManageLeadAssignments,
  leadStatuses,
  splitLeadTags
} from "@/lib/leads";

const leadFormSchema = z.object({
  lead_id: z.string().uuid().optional(),
  company_name: z.string().trim().min(2).max(240),
  contact_name: z.string().trim().max(180).optional().or(z.literal("")),
  director_name: z.string().trim().max(180).optional().or(z.literal("")),
  cin: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(30),
  alternate_phone: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp_number: z.string().trim().max(30).optional().or(z.literal("")),
  source: z.string().trim().min(2).max(80).default("Manual"),
  status: z.enum(leadStatuses).default("new"),
  quality: z.coerce.number().int().min(1).max(5).default(3),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  next_follow_up_at: z.string().trim().optional().or(z.literal("")),
  next_follow_up_note: z.string().trim().max(400).optional().or(z.literal("")),
  compliance_notes: z.string().trim().max(4000).optional().or(z.literal("")),
  remarks: z.string().trim().max(4000).optional().or(z.literal("")),
  tags: z.string().trim().max(400).optional().or(z.literal(""))
});

const commentSchema = z.object({
  lead_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000)
});

const reminderStateSchema = z.object({
  lead_id: z.string().uuid(),
  reminder_id: z.string().uuid(),
  status: z.enum(["pending", "done", "dismissed"])
});

export async function createLead(formData: FormData) {
  try {
    await createLeadImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect((`/leads?error=${encodeURIComponent(getErrorMessage(error, "Could not create lead."))}` as never));
  }
}

export async function updateLead(formData: FormData) {
  try {
    await updateLeadImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const leadId = String(formData.get("lead_id") ?? "");
    redirectToLeads({
      error: getErrorMessage(error, "Could not update lead."),
      selected: leadId || undefined
    });
  }
}

export async function addLeadComment(formData: FormData) {
  try {
    await addLeadCommentImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const leadId = String(formData.get("lead_id") ?? "");
    redirectToLeads({
      error: getErrorMessage(error, "Could not save note."),
      selected: leadId || undefined
    });
  }
}

export async function updateLeadReminderState(formData: FormData) {
  try {
    await updateLeadReminderStateImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const leadId = String(formData.get("lead_id") ?? "");
    redirectToLeads({
      error: getErrorMessage(error, "Could not update reminder."),
      selected: leadId || undefined
    });
  }
}

async function createLeadImpl(formData: FormData) {
  const profile = await requireProfile();
  const parsed = leadFormSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const assignedTo = canManageLeadAssignments(profile.role) ? parsed.assigned_to || null : profile.id;
  const followUpAt = parseDateTimeInput(parsed.next_follow_up_at);

  const { data, error } = await supabase
    .from("leads")
    .insert({
      company_name: parsed.company_name,
      contact_name: parsed.contact_name || null,
      director_name: parsed.director_name || null,
      cin: parsed.cin || null,
      email: parsed.email || null,
      phone: parsed.phone,
      alternate_phone: parsed.alternate_phone || null,
      whatsapp_number: parsed.whatsapp_number || parsed.phone,
      source: parsed.source,
      status: parsed.status,
      quality: parsed.quality,
      assigned_to: assignedTo,
      created_by: profile.id,
      updated_by: profile.id,
      next_follow_up_at: followUpAt,
      next_follow_up_note: parsed.next_follow_up_note || null,
      compliance_notes: parsed.compliance_notes || null,
      remarks: parsed.remarks || null,
      tags: splitLeadTags(parsed.tags)
    })
    .select("id,lead_code")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Lead could not be created.");

  await supabase.from("lead_comments").insert({
    lead_id: data.id,
    author_id: profile.id,
    body: `Lead created by ${profile.full_name}.`,
    is_system: true
  });

  if (followUpAt) {
    await supabase.from("lead_reminders").insert({
      lead_id: data.id,
      due_at: followUpAt,
      note: parsed.next_follow_up_note || "Callback scheduled",
      assigned_to: assignedTo,
      created_by: profile.id
    });
  }

  await supabase.rpc("log_activity", {
    action_type: "lead_created",
    related_client_id: null,
    related_quote_id: null,
    details: {
      lead_id: data.id,
      lead_code: data.lead_code,
      company_name: parsed.company_name,
      assigned_to: assignedTo,
      by: profile.email
    }
  });

  revalidateLeadPaths();
  redirectToLeads({ selected: data.id, success: `Lead ${data.lead_code} created.` });
}

async function updateLeadImpl(formData: FormData) {
  const profile = await requireProfile();
  const parsed = leadFormSchema.parse(Object.fromEntries(formData));
  if (!parsed.lead_id) throw new Error("Lead id is missing.");

  const supabase = createAdminClient();
  const existing = await loadLeadForAccess(supabase, parsed.lead_id, profile);
  const assignedTo = canManageLeadAssignments(profile.role)
    ? parsed.assigned_to || null
    : existing.assigned_to || existing.created_by || profile.id;
  const followUpAt = parseDateTimeInput(parsed.next_follow_up_at);
  const changes: string[] = [];

  if (parsed.status !== existing.status) {
    changes.push(`Status changed to ${parsed.status.replaceAll("_", " ")}.`);
  }

  if (assignedTo !== existing.assigned_to) {
    changes.push("Assignment updated.");
  }

  if (followUpAt !== existing.next_follow_up_at) {
    changes.push(followUpAt ? "Follow-up rescheduled." : "Follow-up cleared.");
  }

  const patch = {
    company_name: parsed.company_name,
    contact_name: parsed.contact_name || null,
    director_name: parsed.director_name || null,
    cin: parsed.cin || null,
    email: parsed.email || null,
    phone: parsed.phone,
    alternate_phone: parsed.alternate_phone || null,
    whatsapp_number: parsed.whatsapp_number || parsed.phone,
    source: parsed.source,
    status: parsed.status,
    quality: parsed.quality,
    assigned_to: assignedTo,
    updated_by: profile.id,
    next_follow_up_at: followUpAt,
    next_follow_up_note: parsed.next_follow_up_note || null,
    compliance_notes: parsed.compliance_notes || null,
    remarks: parsed.remarks || null,
    tags: splitLeadTags(parsed.tags),
    converted_at: parsed.status === "converted" ? existing.converted_at || new Date().toISOString() : parsed.status === existing.status ? existing.converted_at : null,
    lost_at: parsed.status === "lost" ? existing.lost_at || new Date().toISOString() : parsed.status === existing.status ? existing.lost_at : null
  };

  const { error } = await supabase.from("leads").update(patch).eq("id", existing.id);
  if (error) throw new Error(error.message);

  if (followUpAt) {
    const { data: matchingReminder } = await supabase
      .from("lead_reminders")
      .select("id")
      .eq("lead_id", existing.id)
      .eq("status", "pending")
      .eq("due_at", followUpAt)
      .maybeSingle();

    if (!matchingReminder) {
      await supabase.from("lead_reminders").insert({
        lead_id: existing.id,
        due_at: followUpAt,
        note: parsed.next_follow_up_note || "Callback scheduled",
        assigned_to: assignedTo,
        created_by: profile.id
      });
    }
  }

  if (changes.length) {
    await supabase.from("lead_comments").insert({
      lead_id: existing.id,
      author_id: profile.id,
      body: changes.join(" "),
      is_system: true
    });
  }

  await supabase.rpc("log_activity", {
    action_type: "lead_updated",
    related_client_id: null,
    related_quote_id: null,
    details: {
      lead_id: existing.id,
      lead_code: existing.lead_code,
      by: profile.email,
      status: parsed.status,
      assigned_to: assignedTo
    }
  });

  revalidateLeadPaths();
  redirectToLeads({ selected: existing.id, success: `Lead ${existing.lead_code} updated.` });
}

async function addLeadCommentImpl(formData: FormData) {
  const profile = await requireProfile();
  const parsed = commentSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const existing = await loadLeadForAccess(supabase, parsed.lead_id, profile);

  const { error } = await supabase.from("lead_comments").insert({
    lead_id: existing.id,
    author_id: profile.id,
    body: parsed.body,
    is_system: false
  });

  if (error) throw new Error(error.message);

  await supabase.from("leads").update({ last_contacted_at: new Date().toISOString(), updated_by: profile.id }).eq("id", existing.id);
  revalidateLeadPaths();
  redirectToLeads({ selected: existing.id, success: "Note saved." });
}

async function updateLeadReminderStateImpl(formData: FormData) {
  const profile = await requireProfile();
  const parsed = reminderStateSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const existing = await loadLeadForAccess(supabase, parsed.lead_id, profile);

  const patch = {
    status: parsed.status,
    completed_at: parsed.status === "done" ? new Date().toISOString() : null,
    completed_by: parsed.status === "done" ? profile.id : null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("lead_reminders").update(patch).eq("id", parsed.reminder_id).eq("lead_id", existing.id);
  if (error) throw new Error(error.message);

  const { data: nextReminder } = await supabase
    .from("lead_reminders")
    .select("due_at,note")
    .eq("lead_id", existing.id)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("leads")
    .update({
      next_follow_up_at: nextReminder?.due_at ?? null,
      next_follow_up_note: nextReminder?.note ?? null,
      updated_by: profile.id
    })
    .eq("id", existing.id);

  await supabase.from("lead_comments").insert({
    lead_id: existing.id,
    author_id: profile.id,
    body: parsed.status === "done" ? "Reminder marked done." : parsed.status === "dismissed" ? "Reminder dismissed." : "Reminder reopened.",
    is_system: true
  });

  revalidateLeadPaths();
  redirectToLeads({ selected: existing.id, success: "Reminder updated." });
}

async function loadLeadForAccess(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string,
  profile: Awaited<ReturnType<typeof requireProfile>>
) {
  const { data, error } = await supabase
    .from("leads")
    .select("id,lead_code,assigned_to,created_by,status,next_follow_up_at,next_follow_up_note,converted_at,lost_at")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) throw new Error("Lead not found.");
  if (!canAccessLeadRecord(profile, data)) throw new Error("You can only work on your own leads.");
  return data;
}

function parseDateTimeInput(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error("Follow-up date is invalid.");
  return date.toISOString();
}

function redirectToLeads({
  error,
  selected,
  success
}: {
  error?: string;
  selected?: string;
  success?: string;
}) {
  const params = new URLSearchParams();
  if (selected) params.set("selected", selected);
  if (success) params.set("success", success);
  if (error) params.set("error", error);
  const query = params.toString();
  redirect((query ? `/leads?${query}` : "/leads") as never);
}

function revalidateLeadPaths() {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/whatsapp-inbox");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
