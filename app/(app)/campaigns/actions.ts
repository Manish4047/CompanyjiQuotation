"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { bulkEnrollQuotesInDrip, runDueDrips } from "@/lib/drip-engine";
import type { DripStepInput } from "@/lib/drips";
import { loadDynamicListClientRows, loadManualListClientRows, type MarketingListFilters } from "@/lib/marketing-lists";
import { normalizeTagName } from "@/lib/pipeline-taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const marketingListSchema = z.object({
  name: z.string().trim().min(2).max(120),
  list_type: z.enum(["manual", "dynamic"]),
  filter_tag: z.string().trim().max(80).optional(),
  filter_folder_id: z.string().uuid().optional().or(z.literal("")),
  filter_service_id: z.string().uuid().optional().or(z.literal("")),
  filter_category: z.string().trim().max(80).optional(),
  filter_from: z.string().trim().optional(),
  filter_to: z.string().trim().optional(),
  manual_identifiers: z.string().trim().max(4000).optional()
});

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  list_id: z.string().uuid(),
  channel: z.enum(["email", "whatsapp", "both"]),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(10000).default(""),
  whatsapp_template_key: z.string().trim().max(120).optional(),
  whatsapp_template_status: z.enum(["draft", "submitted", "approved", "rejected"]).default("draft"),
  whatsapp_preview_text: z.string().trim().max(2000).optional(),
  scheduled_at: z.string().trim().optional()
});

const campaignStatusSchema = z.object({
  campaign_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "sending", "sent", "paused", "cancelled"])
});

const listDeleteSchema = z.object({
  list_id: z.string().uuid()
});

const dripCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  campaign_type: z.enum(["service_based", "custom", "one_time", "reengagement"]),
  trigger_type: z.enum(["quote_sent", "quote_viewed_no_reply", "inactive_quote", "manual"]),
  channel: z.enum(["email", "whatsapp", "both"]),
  template_category: z.string().trim().min(2).max(80),
  approval_status: z.enum(["draft", "approved", "needs_review"]),
  description: z.string().trim().max(2000).optional(),
  service_ids: z.string().default("[]"),
  require_all_services: z.coerce.boolean().default(false),
  min_quote_amount: z.coerce.number().int().min(0).optional(),
  max_quote_amount: z.coerce.number().int().min(0).optional(),
  inactivity_days: z.coerce.number().int().min(0).optional(),
  frequency_cap_days: z.coerce.number().int().min(1).default(5),
  pause_hours_after_reply: z.coerce.number().int().min(1).default(72),
  stop_on_reply: z.coerce.boolean().default(false),
  stop_on_convert: z.coerce.boolean().default(false),
  stop_on_not_interested: z.coerce.boolean().default(false),
  dnd_respect: z.coerce.boolean().default(false),
  steps: z.string().default("[]")
});

const dripCampaignStatusSchema = z.object({
  campaign_id: z.string().uuid(),
  status: z.enum(["draft", "active", "paused", "archived"])
});

const enrollListInDripSchema = z.object({
  list_id: z.string().uuid(),
  campaign_id: z.string().uuid()
});

export async function createMarketingList(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = marketingListSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const filters = {
    tag: parsed.filter_tag ? normalizeTagName(parsed.filter_tag) : null,
    folder_id: parsed.filter_folder_id || null,
    service_ids: parsed.filter_service_id ? [parsed.filter_service_id] : [],
    category: parsed.filter_category || null,
    from: parsed.filter_from || null,
    to: parsed.filter_to || null,
    identifiers: parsed.list_type === "manual" ? splitIdentifiers(parsed.manual_identifiers) : []
  };

  const { data: list, error } = await supabase
    .from("marketing_lists")
    .insert({
      name: parsed.name,
      list_type: parsed.list_type,
      filters,
      created_by: profile.id
    })
    .select("id,name,list_type")
    .single();

  if (error || !list) redirect(`/campaigns?error=${encodeURIComponent(error?.message ?? "Could not create list.")}` as Route);

  if (parsed.list_type === "manual") {
    const identifiers = splitIdentifiers(parsed.manual_identifiers);
    if (identifiers.length) {
      const [byCode, byGroup] = await Promise.all([
        supabase.from("clients").select("id").in("code", identifiers),
        supabase.from("clients").select("id").in("group_id", identifiers)
      ]);

      const clientIds = [...(byCode.data ?? []), ...(byGroup.data ?? [])].map((item) => item.id);
      const uniqueClientIds = [...new Set(clientIds)];

      if (uniqueClientIds.length) {
        await supabase.from("marketing_list_members").upsert(
          uniqueClientIds.map((clientId) => ({
            list_id: list.id,
            client_id: clientId,
            added_by: profile.id
          })),
          { onConflict: "list_id,client_id" }
        );
      }
    }
  }

  await supabase.rpc("log_activity", {
    action_type: "marketing_list_created",
    details: { list_name: list.name, list_type: list.list_type, by: profile.email }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=List created" as Route);
}

export async function createCampaignDraft(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = campaignSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  if ((parsed.channel === "email" || parsed.channel === "both") && parsed.message.trim().length < 10) {
    redirect(`/campaigns?error=${encodeURIComponent("Add the email message before saving this campaign.")}` as Route);
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name: parsed.name,
      list_id: parsed.list_id,
      channel: parsed.channel,
      status: parsed.scheduled_at ? "scheduled" : "draft",
      subject: parsed.subject || null,
      message: parsed.message,
      whatsapp_template_key: parsed.whatsapp_template_key || null,
      whatsapp_template_status: parsed.whatsapp_template_status,
      whatsapp_preview_text: parsed.whatsapp_preview_text || null,
      scheduled_at: parsed.scheduled_at || null,
      created_by: profile.id
    })
    .select("id,name,channel,status")
    .single();

  if (error || !data) redirect(`/campaigns?error=${encodeURIComponent(error?.message ?? "Could not create campaign.")}` as Route);

  await supabase.rpc("log_activity", {
    action_type: "campaign_created",
    details: { campaign_name: data.name, channel: data.channel, status: data.status, by: profile.email }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=Campaign draft created" as Route);
}

export async function updateCampaignStatus(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = campaignStatusSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: parsed.status })
    .eq("id", parsed.campaign_id)
    .select("id,name,status")
    .single();

  if (error || !data) redirect(`/campaigns?error=${encodeURIComponent(error?.message ?? "Could not update campaign status.")}` as Route);

  await supabase.rpc("log_activity", {
    action_type: "campaign_status_updated",
    details: { campaign_name: data.name, status: data.status, by: profile.email }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=Campaign status updated" as Route);
}

export async function createDripCampaign(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = dripCampaignSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const serviceIds = parseStringArray(parsed.service_ids);
  const steps = parseDripSteps(parsed.steps);

  if (!steps.length) {
    redirect(`/campaigns?error=${encodeURIComponent("Add at least one drip step.")}` as Route);
  }

  const { data: campaign, error } = await supabase
    .from("drip_campaigns")
    .insert({
      name: parsed.name,
      campaign_type: parsed.campaign_type,
      trigger_type: parsed.trigger_type,
      channel: parsed.channel,
      status: parsed.approval_status === "approved" ? "active" : "draft",
      approval_status: parsed.approval_status,
      description: parsed.description || "",
      template_category: parsed.template_category,
      service_ids: serviceIds,
      require_all_services: parsed.require_all_services,
      min_quote_amount: parsed.min_quote_amount ?? null,
      max_quote_amount: parsed.max_quote_amount ?? null,
      inactivity_days: parsed.inactivity_days ?? null,
      frequency_cap_days: parsed.frequency_cap_days,
      pause_hours_after_reply: parsed.pause_hours_after_reply,
      stop_on_reply: parsed.stop_on_reply,
      stop_on_convert: parsed.stop_on_convert,
      stop_on_not_interested: parsed.stop_on_not_interested,
      dnd_respect: parsed.dnd_respect,
      created_by: profile.id,
      updated_by: profile.id
    })
    .select("id,name,status")
    .single();

  if (error || !campaign) {
    redirect(`/campaigns?error=${encodeURIComponent(error?.message ?? "Could not create drip campaign.")}` as Route);
  }

  const { error: stepsError } = await supabase.from("drip_steps").insert(
    steps.map((step) => ({
      campaign_id: campaign.id,
      step_order: step.step_order,
      delay_amount: step.delay_amount,
      delay_unit: step.delay_unit,
      channel: step.channel,
      subject: step.subject || null,
      message: step.message,
      whatsapp_template_key: step.whatsapp_template_key || null,
      whatsapp_template_status: step.whatsapp_template_status ?? "draft",
      whatsapp_preview_text: step.whatsapp_preview_text || null
    }))
  );

  if (stepsError) {
    redirect(`/campaigns?error=${encodeURIComponent(stepsError.message)}` as Route);
  }

  await supabase.rpc("log_activity", {
    action_type: "drip_campaign_created",
    details: {
      campaign_name: campaign.name,
      campaign_type: parsed.campaign_type,
      trigger_type: parsed.trigger_type,
      channel: parsed.channel,
      step_count: steps.length,
      by: profile.email
    }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=Drip campaign created" as Route);
}

export async function updateDripCampaignStatus(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = dripCampaignStatusSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("drip_campaigns")
    .update({
      status: parsed.status,
      updated_by: profile.id
    })
    .eq("id", parsed.campaign_id)
    .select("id,name,status")
    .single();

  if (error || !data) {
    redirect(`/campaigns?error=${encodeURIComponent(error?.message ?? "Could not update drip status.")}` as Route);
  }

  await supabase.rpc("log_activity", {
    action_type: "drip_campaign_status_updated",
    details: { campaign_name: data.name, status: data.status, by: profile.email }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=Drip campaign status updated" as Route);
}

export async function runDueDripsNow() {
  const profile = await requireRole(["admin", "manager"]);
  const result = await runDueDrips({ actorId: profile.id });
  const supabase = await createClient();

  await supabase.rpc("log_activity", {
    action_type: "drips_run_manual",
    details: {
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      stopped: result.stopped,
      by: profile.email
    }
  });

  revalidatePath("/campaigns");
  redirect(
    `/campaigns?success=${encodeURIComponent(
      `Drips run complete. Processed ${result.processed}, sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`
    )}` as Route
  );
}

export async function enrollListInDrip(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = enrollListInDripSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: list, error: listError } = await supabase
    .from("marketing_lists")
    .select("id,name,list_type,filters")
    .eq("id", parsed.list_id)
    .maybeSingle();

  if (listError || !list) {
    redirect(`/campaigns?error=${encodeURIComponent(listError?.message ?? "Could not find the selected list.")}` as Route);
  }

  const listRows =
    list.list_type === "dynamic"
      ? await loadDynamicListClientRows(adminSupabase, (list.filters ?? {}) as MarketingListFilters)
      : await loadManualListClientRows(adminSupabase, list.id);

  const clientIds = [...new Set(listRows.map((row) => row.client_id).filter(Boolean))];
  if (!clientIds.length) {
    redirect(`/campaigns?error=${encodeURIComponent("This list does not have any leads to enroll.")}` as Route);
  }

  const { data: quotesData, error: quotesError } = await adminSupabase
    .from("quotes")
    .select("id,client_id,status,created_at")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false });

  if (quotesError) {
    redirect(`/campaigns?error=${encodeURIComponent(quotesError.message)}` as Route);
  }

  const latestQuoteIdByClient = new Map<string, string>();
  for (const quote of quotesData ?? []) {
    if (!quote?.client_id || latestQuoteIdByClient.has(quote.client_id)) continue;
    if (["spam", "superseded"].includes(String(quote.status ?? ""))) continue;
    latestQuoteIdByClient.set(quote.client_id, quote.id);
  }

  const quoteIds = clientIds.map((clientId) => latestQuoteIdByClient.get(clientId)).filter((value): value is string => Boolean(value));
  const result = await bulkEnrollQuotesInDrip({
    quoteIds,
    campaignId: parsed.campaign_id,
    actorId: profile.id,
    actorName: profile.full_name
  });

  const missingQuotes = clientIds.length - quoteIds.length;

  await supabase.rpc("log_activity", {
    action_type: "drip_list_enrolled",
    details: {
      list_id: list.id,
      list_name: list.name,
      campaign_id: parsed.campaign_id,
      enrolled: result.enrolled,
      skipped: result.skipped,
      missing_quotes: missingQuotes,
      by: profile.email
    }
  });

  revalidatePath("/campaigns");
  revalidatePath("/quotes");

  redirect(
    `/campaigns?${result.ok ? "success" : "error"}=${encodeURIComponent(
      result.ok
        ? `Enrolled ${result.enrolled} leads from ${list.name}. ${missingQuotes ? `${missingQuotes} had no usable quote yet.` : ""}`.trim()
        : result.message
    )}` as Route
  );
}

export async function deleteMarketingList(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = listDeleteSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { data, error } = await supabase.from("marketing_lists").delete().eq("id", parsed.list_id).select("id,name").single();
  if (error || !data) redirect(`/campaigns?error=${encodeURIComponent(friendlyCampaignActionError(error?.message ?? "Could not delete list."))}` as Route);

  await supabase.rpc("log_activity", {
    action_type: "marketing_list_deleted",
    details: { list_name: data.name, by: profile.email }
  });

  revalidatePath("/campaigns");
  redirect("/campaigns?success=List deleted" as Route);
}

function splitIdentifiers(value: string | undefined) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function friendlyCampaignActionError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("foreign key")) {
    return "This list is still linked to campaign drafts. Remove or change those drafts first.";
  }
  return message;
}

function parseStringArray(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function parseDripSteps(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.reduce<DripStepInput[]>((steps, item, index) => {
    if (!item || typeof item !== "object") return steps;
    const record = item as Record<string, unknown>;
    const message = String(record.message ?? "").trim();
    const whatsappTemplateKey = String(record.whatsapp_template_key ?? "").trim();
    const whatsappPreviewText = String(record.whatsapp_preview_text ?? "").trim();
    if (!message && !whatsappTemplateKey && !whatsappPreviewText) return steps;
    steps.push({
      step_order: index + 1,
      delay_amount: Math.max(0, Number(record.delay_amount ?? 0) || 0),
      delay_unit: record.delay_unit === "hours" ? "hours" : "days",
      channel: record.channel === "email" || record.channel === "whatsapp" ? record.channel : "both",
      subject: String(record.subject ?? "").trim(),
      message,
      whatsapp_template_key: whatsappTemplateKey,
      whatsapp_template_status:
        record.whatsapp_template_status === "submitted" ||
        record.whatsapp_template_status === "approved" ||
        record.whatsapp_template_status === "rejected"
          ? record.whatsapp_template_status
          : "draft",
      whatsapp_preview_text: whatsappPreviewText
    });
    return steps;
  }, []);
}
