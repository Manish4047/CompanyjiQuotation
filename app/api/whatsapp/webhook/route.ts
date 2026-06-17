import { NextResponse } from "next/server";
import { ingestLeadSubmission } from "@/lib/lead-ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractIncomingWhatsappMessages, extractWhatsappStatusUpdates, getMetaWhatsappEnv } from "@/lib/whatsapp/meta";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const env = getMetaWhatsappEnv();
  if (!env) {
    return new NextResponse("WhatsApp Meta webhook is not configured.", { status: 500 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: eventRow } = await supabase
    .from("whatsapp_webhook_events")
    .insert({
      object_type: String((payload as { object?: unknown })?.object ?? "whatsapp"),
      payload
    })
    .select("id")
    .single();

  try {
    const messages = extractIncomingWhatsappMessages(payload);
    const statuses = extractWhatsappStatusUpdates(payload);

    for (const message of messages) {
      const conversation = await findOrCreateConversation(supabase, message);
      const { data: existingMessage } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("provider_message_id", message.messageId)
        .maybeSingle();

      if (!existingMessage) {
        await supabase.from("whatsapp_messages").insert({
          conversation_id: conversation.id,
          lead_id: conversation.lead_id,
          direction: "inbound",
          message_status: "received",
          message_type: message.type,
          body: message.text,
          provider_message_id: message.messageId,
          payload: message.raw
        });
      }
    }

    for (const status of statuses) {
      await supabase
        .from("whatsapp_messages")
        .update({
          message_status: mapMessageStatus(status.status),
          error_text: status.errorText,
          payload: status.raw
        })
        .eq("provider_message_id", status.providerMessageId);
    }

    if (eventRow?.id) {
      await supabase.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventRow.id);
    }

    return NextResponse.json({
      ok: true,
      messages: messages.length,
      statuses: statuses.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "WhatsApp webhook processing failed."
      },
      { status: 500 }
    );
  }
}

async function findOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  message: ReturnType<typeof extractIncomingWhatsappMessages>[number]
) {
  const { data: byWaId } = await supabase
    .from("whatsapp_conversations")
    .select("id,lead_id,assigned_to,created_by")
    .eq("wa_id", message.waId)
    .maybeSingle();

  if (byWaId) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        contact_name: message.contactName,
        phone: message.from
      })
      .eq("id", byWaId.id);

    return byWaId;
  }

  const { data: linkedLead } = await supabase
    .from("leads")
    .select("id,assigned_to,created_by")
    .or(
      [
        `normalized_whatsapp_number.eq.${message.localPhone}`,
        `normalized_phone.eq.${message.localPhone}`,
        `normalized_alternate_phone.eq.${message.localPhone}`
      ].join(",")
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resolvedLead =
    linkedLead ??
    (await ensureLeadForIncomingWhatsapp(supabase, message));

  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      lead_id: resolvedLead?.id ?? null,
      wa_id: message.waId,
      contact_name: message.contactName,
      phone: message.from,
      assigned_to: resolvedLead?.assigned_to ?? null,
      created_by: resolvedLead?.created_by ?? null
    })
    .select("id,lead_id,assigned_to,created_by")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create WhatsApp conversation.");
  return data;
}

async function ensureLeadForIncomingWhatsapp(
  supabase: ReturnType<typeof createAdminClient>,
  message: ReturnType<typeof extractIncomingWhatsappMessages>[number]
) {
  const result = await ingestLeadSubmission({
    source: "whatsapp_inbox",
    payload: {
      contact_name: message.contactName,
      preview: message.text,
      wa_id: message.waId
    },
    companyName: message.contactName || `WhatsApp lead ${message.localPhone || message.from}`,
    contactName: message.contactName,
    externalId: `whatsapp:${message.waId}`,
    formName: "WhatsApp inbox",
    phone: message.from,
    quality: 3,
    remarks: message.text || "Inbound WhatsApp message received.",
    sourceCreatedAt: normalizeWhatsappTimestamp(message.timestamp),
    tags: ["whatsapp-inbox"],
    whatsappNumber: message.from
  });

  const { data, error } = await supabase
    .from("leads")
    .select("id,assigned_to,created_by")
    .eq("id", result.leadId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Lead auto-created from WhatsApp could not be loaded.");
  }

  return data;
}

function normalizeWhatsappTimestamp(value: string | null) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return new Date(numeric * 1000).toISOString();
}

function mapMessageStatus(status: string) {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed") return status;
  return "received";
}
