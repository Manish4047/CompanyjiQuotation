"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessConversationRecord,
  canAccessLeadRecord,
  canManageLeadAssignments,
  canUseWhatsAppInbox
} from "@/lib/leads";
import { sendMetaWhatsappTextMessage } from "@/lib/whatsapp/meta";

const replySchema = z.object({
  body: z.string().trim().min(1).max(4096),
  conversation_id: z.string().uuid()
});

const readSchema = z.object({
  conversation_id: z.string().uuid()
});

const linkSchema = z.object({
  conversation_id: z.string().uuid(),
  lead_id: z.string().uuid().optional().or(z.literal(""))
});

export async function sendWhatsappReply(formData: FormData) {
  try {
    await sendWhatsappReplyImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const conversationId = String(formData.get("conversation_id") ?? "");
    redirectToInbox({
      error: getErrorMessage(error, "Could not send WhatsApp reply."),
      selected: conversationId || undefined
    });
  }
}

export async function markConversationRead(formData: FormData) {
  try {
    await markConversationReadImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const conversationId = String(formData.get("conversation_id") ?? "");
    redirectToInbox({
      error: getErrorMessage(error, "Could not mark the conversation read."),
      selected: conversationId || undefined
    });
  }
}

export async function linkConversationToLead(formData: FormData) {
  try {
    await linkConversationToLeadImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const conversationId = String(formData.get("conversation_id") ?? "");
    redirectToInbox({
      error: getErrorMessage(error, "Could not link the conversation."),
      selected: conversationId || undefined
    });
  }
}

async function sendWhatsappReplyImpl(formData: FormData) {
  const profile = await requireProfile();
  if (!canUseWhatsAppInbox(profile.role)) redirect("/dashboard");

  const parsed = replySchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const conversation = await loadConversationForAccess(supabase, parsed.conversation_id, profile);
  const recipient = conversation.phone || conversation.wa_id;
  if (!recipient) throw new Error("This conversation does not have a WhatsApp number yet.");

  try {
    const result = await sendMetaWhatsappTextMessage({ body: parsed.body, to: recipient });
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      direction: "outbound",
      message_status: "sent",
      message_type: "text",
      body: parsed.body,
      provider_message_id: result.messages?.[0]?.id ?? null,
      payload: result,
      sent_by: profile.id
    });

    await supabase.rpc("log_activity", {
      action_type: "whatsapp_reply_sent",
      related_client_id: null,
      related_quote_id: null,
      details: {
        conversation_id: conversation.id,
        lead_id: conversation.lead_id,
        by: profile.email
      }
    });
  } catch (error) {
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      direction: "outbound",
      message_status: "failed",
      message_type: "text",
      body: parsed.body,
      error_text: getErrorMessage(error, "WhatsApp send failed."),
      payload: {},
      sent_by: profile.id
    });
    throw error;
  }

  revalidateInboxPaths();
  redirectToInbox({ selected: conversation.id, success: "Reply sent." });
}

async function markConversationReadImpl(formData: FormData) {
  const profile = await requireProfile();
  if (!canUseWhatsAppInbox(profile.role)) redirect("/dashboard");

  const parsed = readSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const conversation = await loadConversationForAccess(supabase, parsed.conversation_id, profile);

  const { error } = await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", conversation.id);
  if (error) throw new Error(error.message);

  revalidateInboxPaths();
  redirectToInbox({ selected: conversation.id, success: "Conversation marked read." });
}

async function linkConversationToLeadImpl(formData: FormData) {
  const profile = await requireProfile();
  if (!canManageLeadAssignments(profile.role)) throw new Error("Only manager or admin can link conversations.");

  const parsed = linkSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const conversation = await loadConversationForAccess(supabase, parsed.conversation_id, profile);

  let leadAssignment: string | null = null;
  let companyName: string | null = null;

  if (parsed.lead_id) {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id,assigned_to,created_by,company_name")
      .eq("id", parsed.lead_id)
      .maybeSingle();

    if (leadError || !lead) throw new Error("Lead not found.");
    if (!canAccessLeadRecord(profile, lead)) throw new Error("You cannot link to that lead.");
    leadAssignment = lead.assigned_to ?? null;
    companyName = lead.company_name;
  }

  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({
      lead_id: parsed.lead_id || null,
      assigned_to: leadAssignment,
      created_by: conversation.created_by || profile.id
    })
    .eq("id", conversation.id);

  if (error) throw new Error(error.message);

  if (parsed.lead_id) {
    await supabase.from("whatsapp_messages").update({ lead_id: parsed.lead_id }).eq("conversation_id", conversation.id);
  }

  await supabase.rpc("log_activity", {
    action_type: "whatsapp_conversation_linked",
    related_client_id: null,
    related_quote_id: null,
    details: {
      conversation_id: conversation.id,
      lead_id: parsed.lead_id || null,
      company_name: companyName,
      by: profile.email
    }
  });

  revalidateInboxPaths();
  redirectToInbox({
    selected: conversation.id,
    success: parsed.lead_id ? "Conversation linked to lead." : "Lead link removed."
  });
}

async function loadConversationForAccess(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  profile: Awaited<ReturnType<typeof requireProfile>>
) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("id,lead_id,wa_id,phone,assigned_to,created_by,lead:leads(assigned_to,created_by)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) throw new Error("Conversation not found.");

  const lead = Array.isArray(data.lead) ? data.lead[0] : data.lead;
  const visible = canAccessConversationRecord(profile, {
    assigned_to: data.assigned_to,
    created_by: data.created_by,
    lead_assigned_to: lead?.assigned_to ?? null,
    lead_created_by: lead?.created_by ?? null
  });

  if (!visible) throw new Error("You cannot access this conversation.");
  return data as {
    id: string;
    lead_id: string | null;
    wa_id: string | null;
    phone: string | null;
    assigned_to: string | null;
    created_by: string | null;
  };
}

function redirectToInbox({
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
  redirect((params.toString() ? `/whatsapp-inbox?${params.toString()}` : "/whatsapp-inbox") as never);
}

function revalidateInboxPaths() {
  revalidatePath("/whatsapp-inbox");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
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
