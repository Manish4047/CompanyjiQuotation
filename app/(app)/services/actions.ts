"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { defaultCurrencyCode, supportedCurrencyCodes } from "@/lib/currency";
import {
  buildRetainershipDescription,
  normalizeRetainershipCycle,
  servicePricingModes,
  retainershipCycles,
  normalizeServicePricingMode
} from "@/lib/service-pricing";
import { createClient } from "@/lib/supabase/server";

const serviceSchema = z.object({
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  pricing_mode: z.enum(servicePricingModes),
  currency_code: z.enum(supportedCurrencyCodes).default(defaultCurrencyCode),
  short_description: z.string().trim().max(240).default(""),
  full_description: z.string().trim().max(4000).default(""),
  prepaid_fee: z.coerce.number().int().min(0).default(0),
  postpaid_fee: z.coerce.number().int().min(0).default(0),
  retainership_fee: z.coerce.number().int().min(0).default(0),
  retainership_cycle: z.enum(retainershipCycles).default("monthly"),
  prepaid_description: z.string().trim().max(1000).default("Full payment upfront. Work begins after payment confirms."),
  postpaid_description: z.string().trim().max(1000).default("No advance. Payment is due after the agreed milestone."),
  first_installment: z.coerce.number().int().min(0).optional(),
  first_trigger: z.string().trim().max(200).optional(),
  second_trigger: z.string().trim().max(200).optional(),
  timeline_best: z.string().trim().max(120).optional(),
  timeline_typical: z.string().trim().max(120).optional(),
  timeline_worst: z.string().trim().max(120).optional(),
  inclusions: z.string().trim().max(6000).default(""),
  not_included: z.string().trim().max(6000).default(""),
  required_documents: z.string().trim().max(6000).default(""),
  include_government_fees_clause: z.coerce.boolean().default(false),
  include_out_of_pocket_clause: z.coerce.boolean().default(false),
  state_variations_apply: z.coerce.boolean().default(false),
  is_addon_template: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
  internal_notes: z.string().trim().max(4000).optional()
});

const governmentFeesClause = "Government fees, if any, shall be extra.";
const outOfPocketClause = "Out-of-pocket expenditure, if any, shall be extra.";

export async function createService(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = parseServiceForm(formData);
  const documentTemplateIds = parseDocumentTemplateIds(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("services").insert(parsed).select("id,name").single();

  if (error) {
    redirectWithServiceError(friendlyServiceError(error.message));
  }

  await syncServiceDocumentTemplates(supabase, data.id, documentTemplateIds);

  await supabase.rpc("log_activity", {
    action_type: "service_created",
    details: {
      service_id: data.id,
      service_name: data.name,
      by: profile.email
    }
  });

  revalidatePath("/services");
  redirect("/services?success=Service saved");
}

export async function updateService(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseServiceForm(formData);
  const documentTemplateIds = parseDocumentTemplateIds(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("services").update(parsed).eq("id", id).select("id,name").single();

  if (error) {
    redirectWithServiceError(friendlyServiceError(error.message));
  }

  await syncServiceDocumentTemplates(supabase, data.id, documentTemplateIds);

  await supabase.rpc("log_activity", {
    action_type: "service_updated",
    details: {
      service_id: data.id,
      service_name: data.name,
      by: profile.email
    }
  });

  revalidatePath("/services");
  redirect("/services?success=Service updated");
}

export async function deleteService(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data: service } = await supabase.from("services").select("id,name").eq("id", id).single();
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    const { error: deactivateError } = await supabase.from("services").update({ active: false }).eq("id", id);
    if (deactivateError) redirectWithServiceError(friendlyServiceError(deactivateError.message));
  }

  await supabase.rpc("log_activity", {
    action_type: error ? "service_deactivated_after_delete_blocked" : "service_deleted",
    details: {
      service_id: id,
      service_name: service?.name,
      by: profile.email,
      reason: error?.message
    }
  });

  revalidatePath("/services");
  redirect(error ? "/services?success=Service is already used, so it was deactivated instead" : "/services?success=Service deleted");
}

export async function toggleServiceActive(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const nextActive = String(formData.get("nextActive") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .update({ active: nextActive })
    .eq("id", id)
    .select("id,name")
    .single();

  if (error) {
    redirectWithServiceError(friendlyServiceError(error.message));
  }

  await supabase.rpc("log_activity", {
    action_type: nextActive ? "service_activated" : "service_deactivated",
    details: {
      service_id: data.id,
      service_name: data.name,
      by: profile.email
    }
  });

  revalidatePath("/services");
  redirect("/services?success=Service status updated");
}

function parseServiceForm(formData: FormData) {
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectWithServiceError(parsed.error.issues[0]?.message ?? "Please check the service details.");
  }

  const { include_government_fees_clause, include_out_of_pocket_clause, ...serviceData } = parsed.data;
  const pricingMode = normalizeServicePricingMode(serviceData.pricing_mode);
  const retainershipCycle = normalizeRetainershipCycle(serviceData.retainership_cycle);
  const retainershipFee = Math.max(0, Math.round(serviceData.retainership_fee ?? 0));
  const extraCostsClause = [
    include_government_fees_clause ? governmentFeesClause : "",
    include_out_of_pocket_clause ? outOfPocketClause : ""
  ]
    .filter(Boolean)
    .join(" ");

  const prepaidFee = pricingMode === "retainership" ? retainershipFee : serviceData.prepaid_fee;
  const postpaidFee = pricingMode === "retainership" ? retainershipFee : serviceData.postpaid_fee;

  return {
    ...serviceData,
    pricing_mode: pricingMode,
    retainership_fee: retainershipFee,
    retainership_cycle: retainershipCycle,
    prepaid_fee: prepaidFee,
    postpaid_fee: postpaidFee,
    prepaid_description: pricingMode === "retainership" ? buildRetainershipDescription(retainershipCycle) : serviceData.prepaid_description,
    postpaid_description: pricingMode === "retainership" ? buildRetainershipDescription(retainershipCycle) : serviceData.postpaid_description,
    first_installment: pricingMode === "retainership" ? 0 : serviceData.first_installment,
    first_trigger: pricingMode === "retainership" ? undefined : serviceData.first_trigger,
    second_trigger: pricingMode === "retainership" ? undefined : serviceData.second_trigger,
    extra_costs_clause: extraCostsClause,
    code: normalizeServiceCode(serviceData.code || serviceData.name)
  };
}

function parseDocumentTemplateIds(formData: FormData) {
  return formData
    .getAll("document_template_ids")
    .map((value) => String(value))
    .filter(Boolean);
}

async function syncServiceDocumentTemplates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
  documentTemplateIds: string[]
) {
  const { error: deleteError } = await supabase.from("service_document_templates").delete().eq("service_id", serviceId);
  if (deleteError) redirectWithServiceError(friendlyServiceError(deleteError.message));

  if (!documentTemplateIds.length) return;

  const { error: insertError } = await supabase.from("service_document_templates").insert(
    documentTemplateIds.map((documentTemplateId) => ({
      service_id: serviceId,
      document_template_id: documentTemplateId
    }))
  );

  if (insertError) redirectWithServiceError(friendlyServiceError(insertError.message));
}

function redirectWithServiceError(message: string): never {
  redirect(`/services?error=${encodeURIComponent(message)}`);
}

function normalizeServiceCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function friendlyServiceError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("column") || lower.includes("schema cache")) {
    return "The database is missing newer service fields. Run migrations 0002, 0003, 0010, and 0011 in Supabase SQL Editor, then try again.";
  }

  if (lower.includes("relation") && lower.includes("service_document_templates")) {
    return "The database is missing the document linking table. Run supabase/migrations/0003_quote_composer_libraries.sql in Supabase SQL Editor.";
  }

  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You need an active Admin profile to add or edit services. Check your profile role in the profiles table.";
  }

  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "A service with this code already exists. Change the service code or leave it blank so the app can generate one.";
  }

  return message;
}
