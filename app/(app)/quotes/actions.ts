"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { canDraftQuote, canSendQuote, type AppProfile } from "@/lib/auth/roles";
import { buildContactLookup, matchesNormalizedContact, mergeContactRecord, normalizeEmail } from "@/lib/contacts";
import { defaultCurrencyCode, supportedCurrencyCodes } from "@/lib/currency";
import { serializeStructuredDocumentLines, type StructuredDocumentLine } from "@/lib/document-format";
import { autoEnrollQuoteInMatchingDrips, manualEnrollQuoteInDrip, stopQuoteDrips, updateDripEnrollmentStatus } from "@/lib/drip-engine";
import { sendBrevoEmail } from "@/lib/email/brevo";
import { buildQuoteEmail, type QuoteRenderData } from "@/lib/quotes/render";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateQuotePricingWithAdjustments,
  calculateTwoPlanPricingWithAdjustments,
  type CustomServiceItem,
  type QuoteAddon,
  type QuoteFeeItem,
  type QuotePlan
} from "@/lib/pricing";
import { defaultQuotePreviewCopy, type QuotePreviewCopy } from "@/lib/settings";

const createQuoteSchema = z.object({
  client_mode: z.enum(["new", "existing"]),
  existing_client_id: z.string().uuid().optional().or(z.literal("")),
  source_lead_id: z.string().uuid().optional().or(z.literal("")),
  client_name: z.string().trim().max(180).optional(),
  company_name: z.string().trim().max(240).optional(),
  client_code: z.string().trim().max(60).optional(),
  group_id: z.string().trim().max(60).optional(),
  client_type: z.string().trim().max(80).optional(),
  source: z.string().trim().max(80).optional(),
  primary_email: z.string().trim().email().optional().or(z.literal("")),
  secondary_email: z.string().trim().email().optional().or(z.literal("")),
  primary_mobile: z.string().trim().max(30).optional(),
  secondary_mobile: z.string().trim().max(30).optional(),
  whatsapp_consent: z.coerce.boolean().default(false),
  tags: z.string().trim().max(400).optional(),
  currency_code: z.enum(supportedCurrencyCodes).default(defaultCurrencyCode),
  plan_chosen: z.enum(["prepaid", "postpaid", "not_yet_chosen"]),
  state_id: z.string().uuid().optional().or(z.literal("")),
  service_ids: z.string().default("[]"),
  service_fee_overrides: z.string().default("{}"),
  custom_service_items: z.string().default("[]"),
  addon_items: z.string().default("[]"),
  other_fee_items: z.string().default("[]"),
  document_items: z.string().default("[]"),
  canned_note_items: z.string().default("[]"),
  include_prepaid_plan: z.string().default("true").transform((value) => value === "true"),
  include_postpaid_plan: z.string().default("true").transform((value) => value === "true"),
  recommended_plan: z.enum(["prepaid", "postpaid"]).default("postpaid"),
  show_service_breakup: z.coerce.boolean().default(false),
  include_extra_costs_clause: z.coerce.boolean().default(false),
  discount_amount: z.coerce.number().int().min(0).default(0),
  gst_rate_percent: z.coerce.number().min(0).max(100).default(0),
  gst_base_amount: z.coerce.number().int().min(0).optional(),
  preview_overrides: z.string().default("{}"),
  custom_note: z.string().trim().max(2000).optional(),
  validity_days: z.coerce.number().int().min(1).max(60).default(15),
  submit_intent: z.enum(["draft", "email", "whatsapp", "all"]).default("draft")
});

const sendQuoteSchema = z.object({
  quote_id: z.string().uuid()
});

const quoteStatusSchema = z.object({
  quote_id: z.string().uuid(),
  status: z.enum(["sent", "viewed", "negotiating", "accepted", "expired", "refresh_requested", "lost", "lost_nurture", "dormant", "spam", "superseded"])
});

const enrollQuoteInDripSchema = z.object({
  quote_id: z.string().uuid(),
  campaign_id: z.string().uuid()
});

const dripEnrollmentStatusSchema = z.object({
  quote_id: z.string().uuid(),
  enrollment_id: z.string().uuid(),
  status: z.enum(["active", "paused", "stopped"])
});

type QuoteForSending = QuoteRenderData & {
  client_id: string;
  status: string;
  sent_via: string[] | null;
};

type ContactForSending = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
  whatsapp_consent: boolean;
  do_not_contact: boolean;
  opt_outs: string[] | null;
};

type SendQuoteEmailResult = {
  ok: boolean;
  message: string;
};

/**
 * Next.js implements `redirect()` by throwing a sentinel error. If we wrap a
 * server action in try/catch we must re-throw that sentinel or the redirect
 * never happens. The sentinel error has a `digest` string starting with
 * `NEXT_REDIRECT`; that's the stable contract Next docs reference.
 */
function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createQuoteDraft(formData: FormData) {
  try {
    await createQuoteDraftImpl(formData);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not save quote. Please check the form and try again.";
    const params = new URLSearchParams();
    params.set("error", message);
    const sourceLeadId = String(formData.get("source_lead_id") ?? "").trim();
    if (sourceLeadId) {
      params.set("lead", sourceLeadId);
    }
    // Log the full stack server-side; show only the user-facing message in the URL.
    console.error("[createQuoteDraft] failed:", error);
    redirect(`/quotes/new?${params.toString()}`);
  }
}

async function createQuoteDraftImpl(formData: FormData) {
  const profile = await requireProfile();
  if (!canDraftQuote(profile.role)) redirect("/dashboard");

  const parsed = createQuoteSchema.parse(Object.fromEntries(formData));
  const serviceIds = parseStringArray(parsed.service_ids);
  const serviceFeeOverrides = parseServiceFeeOverrides(parsed.service_fee_overrides);
  const customServices = parseCustomServices(parsed.custom_service_items);
  const addons = parseAddons(parsed.addon_items);
  const otherFees = parseOtherFees(parsed.other_fee_items);
  const documentItems = parseDocumentItems(parsed.document_items);
  const cannedNoteItems = parseCannedNoteItems(parsed.canned_note_items);
  const previewOverrides = parsePreviewOverrides(parsed.preview_overrides);
  const tags = splitTags(parsed.tags);
  const includePrepaidPlan = parsed.include_prepaid_plan || !parsed.include_postpaid_plan;
  const includePostpaidPlan = parsed.include_postpaid_plan || !parsed.include_prepaid_plan;
  const recommendedPlan: Extract<QuotePlan, "prepaid" | "postpaid"> =
    (parsed.recommended_plan === "prepaid" && includePrepaidPlan) || (parsed.recommended_plan === "postpaid" && includePostpaidPlan)
      ? parsed.recommended_plan
      : includePostpaidPlan
        ? "postpaid"
        : "prepaid";

  if (!serviceIds.length && !customServices.length) {
    throw new Error("Select or write at least one service.");
  }

  const supabase = createAdminClient();
  const { data: services, error: servicesError } = serviceIds.length
    ? await supabase
        .from("services")
        .select("id,name,pricing_mode,currency_code,prepaid_fee,postpaid_fee,retainership_fee,retainership_cycle,state_variations_apply,required_documents,inclusions,extra_costs_clause")
        .in("id", serviceIds)
        .eq("active", true)
    : { data: [], error: null };

  if (servicesError) {
    throw new Error(servicesError?.message ?? "Selected services are not available.");
  }

  const mismatchedService = (services ?? []).find((service) => service.currency_code !== parsed.currency_code);
  if (mismatchedService) {
    throw new Error(`"${mismatchedService.name}" is priced in ${mismatchedService.currency_code}. Use one currency per quote.`);
  }

  const { data: state } = parsed.state_id
    ? await supabase.from("states").select("id,surcharge").eq("id", parsed.state_id).maybeSingle()
    : { data: null };

  const servicesWithOverrides = (services ?? []).map((service) => {
    const override = serviceFeeOverrides[service.id];
    const retainershipFee = override?.retainership_fee ?? service.retainership_fee ?? service.postpaid_fee;
    const quantity = override?.quantity ?? 1;
    return {
      ...service,
      prepaid_fee: service.pricing_mode === "retainership" ? retainershipFee : override?.prepaid_fee ?? service.prepaid_fee,
      postpaid_fee: service.pricing_mode === "retainership" ? retainershipFee : override?.postpaid_fee ?? service.postpaid_fee,
      retainership_fee: retainershipFee,
      quantity
    };
  });

  const priceableCustomServices = customServices.map((service) => ({
    id: `custom:${service.name}`,
    name: service.name,
    prepaid_fee: service.prepaid_fee,
    postpaid_fee: service.postpaid_fee,
    state_variations_apply: false,
    quantity: 1
  }));

  const allPriceableServices = [...servicesWithOverrides, ...priceableCustomServices];
  const gstBaseAmount = formData.has("gst_base_amount") && String(formData.get("gst_base_amount") ?? "") !== "" ? parsed.gst_base_amount ?? 0 : null;
  const twoPlanPricing = calculateTwoPlanPricingWithAdjustments({
    services: allPriceableServices,
    stateSurcharge: Number(state?.surcharge ?? 0),
    addons,
    otherFees,
    discountAmount: parsed.discount_amount,
    gstRatePercent: parsed.gst_rate_percent,
    gstBaseAmount
  });
  const selectedPlanForStorage: QuotePlan =
    parsed.plan_chosen === "not_yet_chosen" || (parsed.plan_chosen === "prepaid" && !includePrepaidPlan) || (parsed.plan_chosen === "postpaid" && !includePostpaidPlan)
      ? recommendedPlan
      : parsed.plan_chosen;
  const pricing = calculateQuotePricingWithAdjustments({
    services: allPriceableServices,
    plan: selectedPlanForStorage,
    stateSurcharge: Number(state?.surcharge ?? 0),
    addons,
    otherFees,
    discountAmount: parsed.discount_amount,
    gstRatePercent: parsed.gst_rate_percent,
    gstBaseAmount
  });
  const storagePricing = pricing;
  const requiredDocuments = documentItems.length
    ? serializeStructuredDocumentLines(
        documentItems.map((document) => ({
          kind: document.kind,
          label: document.label
        }))
      )
    : [
        ...servicesWithOverrides.map((service) => String(service.required_documents ?? "")).filter(Boolean),
        ...customServices.map((service) => service.required_documents ?? "").filter(Boolean)
      ].join("\n\n");

  let clientId = parsed.existing_client_id || "";
  const companyNameSnapshot = parsed.company_name?.trim() || null;
  let clientMobileSnapshot = (parsed.primary_mobile || parsed.secondary_mobile || "").trim() || null;

  if (parsed.client_mode === "existing") {
    if (!clientId) throw new Error("Choose an existing client.");

    const { data: existingContact } = await supabase
      .from("contact_details")
      .select("primary_mobile,secondary_mobile,whatsapp_number")
      .eq("client_id", clientId)
      .maybeSingle();
    clientMobileSnapshot =
      existingContact?.primary_mobile || existingContact?.secondary_mobile || existingContact?.whatsapp_number || clientMobileSnapshot;

    await supabase
      .from("clients")
      .update({
        tags,
        last_interaction_at: new Date().toISOString()
      })
      .eq("id", clientId);
  } else {
    if (!parsed.client_name || parsed.client_name.length < 2) throw new Error("Enter the new client name.");
    const matchingClientId = await findMatchingClientId(supabase, {
      primary_email: parsed.primary_email || null,
      secondary_email: parsed.secondary_email || null,
      primary_mobile: parsed.primary_mobile || null,
      secondary_mobile: parsed.secondary_mobile || null
    });

    if (matchingClientId) {
      clientId = matchingClientId;
      const [{ data: existingContact }, { data: existingClient }] = await Promise.all([
        supabase
          .from("contact_details")
          .select("primary_email,secondary_email,historical_emails,primary_mobile,secondary_mobile,historical_mobiles,whatsapp_number,whatsapp_consent")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase.from("clients").select("tags").eq("id", clientId).maybeSingle()
      ]);

      const mergedContact = mergeContactRecord(existingContact, {
        primary_email: parsed.primary_email || null,
        secondary_email: parsed.secondary_email || null,
        primary_mobile: parsed.primary_mobile || null,
        secondary_mobile: parsed.secondary_mobile || null,
        whatsapp_consent: parsed.whatsapp_consent
      });
      clientMobileSnapshot = mergedContact.primary_mobile || mergedContact.secondary_mobile || mergedContact.whatsapp_number || clientMobileSnapshot;

      await supabase
        .from("clients")
        .update({
          code: parsed.client_code ? normalizeReferenceCode(parsed.client_code) : undefined,
          group_id: parsed.group_id ? normalizeReferenceCode(parsed.group_id) : undefined,
          name: parsed.client_name,
          client_type: parsed.client_type || null,
          source: parsed.source || "Office Manual",
          assigned_to: profile.id,
          last_interaction_at: new Date().toISOString(),
          tags: mergeTags(tags, existingClient?.tags ?? [])
        })
        .eq("id", clientId);

      const contactPayload = {
        ...mergedContact,
        preferred_channel: mergedContact.primary_email ? "email" : "phone",
        updated_by: profile.id
      };

      if (existingContact) {
        await supabase.from("contact_details").update(contactPayload).eq("client_id", clientId);
      } else {
        await supabase.from("contact_details").insert({
          client_id: clientId,
          ...contactPayload
        });
      }
    } else {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          code: parsed.client_code ? normalizeReferenceCode(parsed.client_code) : undefined,
          group_id: parsed.group_id ? normalizeReferenceCode(parsed.group_id) : null,
          name: parsed.client_name,
          client_type: parsed.client_type || null,
          source: parsed.source || "Office Manual",
          status: "active_lead",
          assigned_to: profile.id,
          tags
        })
        .select("id")
        .single();

      if (clientError || !client) {
        throw new Error(clientError?.message ?? "Could not create client.");
      }

      clientId = client.id;

      if (parsed.primary_email || parsed.secondary_email || parsed.primary_mobile || parsed.secondary_mobile) {
        const mergedContact = mergeContactRecord(null, {
          primary_email: parsed.primary_email || null,
          secondary_email: parsed.secondary_email || null,
          primary_mobile: parsed.primary_mobile || null,
          secondary_mobile: parsed.secondary_mobile || null,
          whatsapp_consent: parsed.whatsapp_consent
        });
        clientMobileSnapshot = mergedContact.primary_mobile || mergedContact.secondary_mobile || mergedContact.whatsapp_number || clientMobileSnapshot;

        await supabase.from("contact_details").insert({
          client_id: clientId,
          ...mergedContact,
          preferred_channel: mergedContact.primary_email ? "email" : "phone",
          updated_by: profile.id
        });
      }
    }
  }

  // Only supersede existing open quotes for the SAME client when they cover the
  // exact same set of services as the new quote. Previously this update ran with
  // no service filter, so a new "Trademark" quote silently marked an open "GST"
  // quote for the same client as superseded. Quotes that contain free-text
  // custom services are never auto-superseded (we cannot compare them safely);
  // the user can still flip status manually from the pipeline.
  if (serviceIds.length && !customServices.length) {
    await supersedeMatchingClientQuotes(supabase, clientId, serviceIds);
  }

  const validityDate = new Date();
  validityDate.setDate(validityDate.getDate() + parsed.validity_days);

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      currency_code: parsed.currency_code,
      plan_chosen: parsed.plan_chosen,
      state_id: parsed.state_id || null,
      subtotal: storagePricing.subtotal,
      state_variation_add: storagePricing.stateVariationAdd,
      addon_items: addons,
      custom_service_items: customServices,
      service_fee_overrides: serviceFeeOverrides,
      show_service_breakup: parsed.show_service_breakup,
      include_extra_costs_clause: parsed.include_extra_costs_clause,
      addon_total: storagePricing.addonTotal,
      other_fee_items: otherFees,
      other_fee_total: storagePricing.otherFeeTotal,
      discount_amount: storagePricing.discountAmount,
      total_before_gst: storagePricing.totalBeforeGst,
      gst_rate_percent: storagePricing.gstRatePercent,
      gst_base_amount: gstBaseAmount,
      gst_amount: storagePricing.gstAmount,
      total_amount: storagePricing.totalAmount,
      prepaid_total_amount: twoPlanPricing.prepaid.totalAmount,
      postpaid_total_amount: twoPlanPricing.postpaid.totalAmount,
      include_prepaid_plan: includePrepaidPlan,
      include_postpaid_plan: includePostpaidPlan,
      recommended_plan: recommendedPlan,
      company_name_snapshot: companyNameSnapshot,
      client_mobile_snapshot: clientMobileSnapshot,
      required_documents_snapshot: requiredDocuments,
      document_items: documentItems,
      canned_note_items: cannedNoteItems,
      preview_overrides: previewOverrides,
      custom_note: parsed.custom_note || null,
      validity_date: validityDate.toISOString().slice(0, 10),
      status: "draft",
      assigned_to: profile.id,
      created_by: profile.id,
      source_lead_id: parsed.source_lead_id || null,
      source_entry: parsed.client_mode === "existing" ? "Existing Client" : parsed.source || "Office Manual",
      tags
    })
    .select("id,quote_id_formatted")
    .single();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Could not create quote.");
  }

  if (servicesWithOverrides.length) {
    await supabase.from("quotes_services").insert(
      servicesWithOverrides.map((service) => ({
        quote_id: quote.id,
        service_id: service.id,
        fee_snapshot:
          selectedPlanForStorage === "postpaid"
            ? service.postpaid_fee
            : selectedPlanForStorage === "prepaid"
              ? service.prepaid_fee
              : Math.max(service.prepaid_fee, service.postpaid_fee)
      }))
    );
  }

  await supabase.from("activity_log").insert({
    user_id: profile.id,
    user_email: profile.email,
    action_type: "quote_created",
    related_client_id: clientId,
    related_quote_id: quote.id,
      details: {
        quote_id_formatted: quote.quote_id_formatted,
        created_by: profile.email,
        currency_code: parsed.currency_code,
        plan: parsed.plan_chosen,
      prepaid_total: twoPlanPricing.prepaid.totalAmount,
      postpaid_total: twoPlanPricing.postpaid.totalAmount,
      recommended_plan: recommendedPlan,
      visible_plans: {
        prepaid: includePrepaidPlan,
        postpaid: includePostpaidPlan
      },
      other_fees: storagePricing.otherFeeTotal,
      discount: storagePricing.discountAmount,
      gst: storagePricing.gstAmount,
      tags
    }
  });

  if (parsed.source_lead_id) {
    await syncLeadQuoteLink({
      leadId: parsed.source_lead_id,
      profile,
      quoteId: quote.id,
      quoteIdFormatted: quote.quote_id_formatted,
      submitIntent: parsed.submit_intent,
      supabase
    });
  }

  const redirectParams = new URLSearchParams();

  if (parsed.submit_intent === "email" || parsed.submit_intent === "all") {
    const emailResult = await sendQuoteEmailForQuote({
      quoteId: quote.id,
      profile,
      supabase
    });

    redirectParams.set(emailResult.ok ? "success" : "error", emailResult.message);
  }

  if (parsed.submit_intent === "whatsapp" || parsed.submit_intent === "all") {
    redirectParams.set("whatsapp", "1");
    if (!redirectParams.has("success") && !redirectParams.has("error")) {
      redirectParams.set("success", "Quote created. WhatsApp brief and PDF sheet are ready.");
    }
  }

  const queryString = redirectParams.toString();
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  redirect(`/quotes/${quote.id}${queryString ? `?${queryString}` : ""}`);
}

async function syncLeadQuoteLink({
  leadId,
  profile,
  quoteId,
  quoteIdFormatted,
  submitIntent,
  supabase
}: {
  leadId: string;
  profile: AppProfile;
  quoteId: string;
  quoteIdFormatted: string;
  submitIntent: "draft" | "email" | "whatsapp" | "all";
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { data: lead, error } = await supabase.from("leads").select("id,status").eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) return;

  const nextStatus =
    lead.status === "converted" || lead.status === "lost"
      ? lead.status
      : "qualified";

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status: nextStatus,
      updated_by: profile.id
    })
    .eq("id", leadId);

  if (updateError) throw new Error(updateError.message);

  const { error: commentError } = await supabase.from("lead_comments").insert({
    lead_id: leadId,
    author_id: profile.id,
    body:
      submitIntent === "email" || submitIntent === "all"
        ? `Quote ${quoteIdFormatted} was created, sent, and handed to the quotation pipeline from this lead.`
        : `Quote ${quoteIdFormatted} was created from this lead and moved into quotation follow-through.`,
    is_system: true
  });

  if (commentError) throw new Error(commentError.message);

  await supabase.rpc("log_activity", {
    action_type: "lead_linked_quote",
    related_client_id: null,
    related_quote_id: quoteId,
    details: {
      by: profile.email,
      lead_id: leadId,
      quote_id_formatted: quoteIdFormatted,
      submit_intent: submitIntent
    }
  });
}

export async function sendQuoteByEmail(formData: FormData) {
  const profile = await requireProfile();
  if (!canSendQuote(profile.role)) redirect("/dashboard");

  const parsed = sendQuoteSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();
  const result = await sendQuoteEmailForQuote({
    quoteId: parsed.quote_id,
    profile,
    supabase
  });

  redirect(`/quotes/${parsed.quote_id}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`);
}

export async function updateQuoteStatusFromDetail(formData: FormData) {
  const profile = await requireProfile();
  if (!canDraftQuote(profile.role)) redirect("/dashboard");

  const parsed = quoteStatusSchema.parse(Object.fromEntries(formData));
  const supabase = createAdminClient();

  const statusDates =
    parsed.status === "accepted"
      ? { won_date: new Date().toISOString(), lost_date: null }
      : parsed.status === "lost"
        ? { lost_date: new Date().toISOString(), won_date: null }
        : {};

  const { data, error } = await supabase
    .from("quotes")
    .update({ status: parsed.status, ...statusDates })
    .eq("id", parsed.quote_id)
    .select("id,quote_id_formatted,client_id,status")
    .single();

  if (error || !data) {
    redirect(`/quotes/${parsed.quote_id}?error=${encodeURIComponent(error?.message ?? "Could not update quote status.")}`);
  }

  await supabase.rpc("log_activity", {
    action_type: "quote_status_changed",
    related_client_id: data.client_id,
    related_quote_id: data.id,
    details: {
      quote_id_formatted: data.quote_id_formatted,
      new_status: data.status,
      by: profile.email,
      source: "quote_detail"
    }
  });

  if (parsed.status === "accepted") {
    await stopQuoteDrips({
      quoteId: data.id,
      reason: "Quote accepted.",
      completed: true
    });
  } else if (["lost", "lost_nurture", "spam", "dormant", "superseded"].includes(parsed.status)) {
    await stopQuoteDrips({
      quoteId: data.id,
      reason: `Quote moved to ${parsed.status}.`
    });
  }

  revalidatePath(`/quotes/${data.id}`);
  revalidatePath("/quotes");
  revalidatePath("/pipeline");
  revalidatePath("/campaigns");

  redirect(`/quotes/${data.id}?success=${encodeURIComponent("Quote status updated")}`);
}

export async function enrollQuoteInDripFromDetail(formData: FormData) {
  const profile = await requireProfile();
  if (!canDraftQuote(profile.role)) redirect("/dashboard");

  const parsed = enrollQuoteInDripSchema.parse(Object.fromEntries(formData));
  const result = await manualEnrollQuoteInDrip({
    quoteId: parsed.quote_id,
    campaignId: parsed.campaign_id,
    actorId: profile.id,
    actorName: profile.full_name
  });

  revalidatePath(`/quotes/${parsed.quote_id}`);
  revalidatePath("/campaigns");

  redirect(`/quotes/${parsed.quote_id}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`);
}

export async function updateQuoteDripEnrollmentStatus(formData: FormData) {
  const profile = await requireProfile();
  if (!canDraftQuote(profile.role)) redirect("/dashboard");

  const parsed = dripEnrollmentStatusSchema.parse(Object.fromEntries(formData));
  const result = await updateDripEnrollmentStatus({
    enrollmentId: parsed.enrollment_id,
    status: parsed.status,
    reason: parsed.status === "stopped" ? "Stopped from quote detail." : undefined
  });

  revalidatePath(`/quotes/${parsed.quote_id}`);
  revalidatePath("/campaigns");

  redirect(`/quotes/${parsed.quote_id}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`);
}

async function sendQuoteEmailForQuote({
  quoteId,
  profile,
  supabase
}: {
  quoteId: string;
  profile: AppProfile;
  supabase: ReturnType<typeof createAdminClient>;
}): Promise<SendQuoteEmailResult> {
  let quote: QuoteForSending | null = null;
  let recipientEmail = "";
  let subject = "";

  try {
    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .select(
      "id,quote_id_formatted,client_id,status,sent_via,validity_date,recommended_plan,show_service_breakup,include_prepaid_plan,include_postpaid_plan,currency_code,company_name_snapshot,client_mobile_snapshot,prepaid_total_amount,postpaid_total_amount,state_variation_add,addon_total,other_fee_total,discount_amount,gst_rate_percent,gst_amount,total_amount,required_documents_snapshot,service_fee_overrides,document_items,custom_service_items,addon_items,other_fee_items,custom_note,clients(name),quotes_services(service_id,fee_snapshot,services(name,short_description,full_description,pricing_mode,currency_code,prepaid_fee,postpaid_fee,retainership_fee,retainership_cycle,prepaid_description,postpaid_description,inclusions,first_installment,first_trigger,second_trigger,timeline_typical,extra_costs_clause))"
      )
      .eq("id", quoteId)
      .single();

    if (quoteError || !quoteData) {
      throw new Error(quoteError?.message ?? "Quote not found.");
    }

    quote = quoteData as unknown as QuoteForSending;

    const { data: contact, error: contactError } = await supabase
      .from("contact_details")
      .select("primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number,whatsapp_consent,do_not_contact,opt_outs")
      .eq("client_id", quote.client_id)
      .maybeSingle();

    if (contactError) throw new Error(contactError.message);

    const contactDetails = contact as ContactForSending | null;
    if (!contactDetails?.primary_email && !contactDetails?.secondary_email) {
      throw new Error("No email is saved for this client. Add the email while creating the quote or from client contact details.");
    }
    if (contactDetails.do_not_contact || contactDetails.opt_outs?.includes("all")) {
      throw new Error("This client is marked Do Not Contact.");
    }

    recipientEmail = contactDetails.primary_email || contactDetails.secondary_email || "";
    const normalizedRecipientEmail = normalizeEmail(recipientEmail);

    if (!normalizedRecipientEmail) {
      throw new Error("This client does not have an email address saved.");
    }

    if (!z.string().email().safeParse(normalizedRecipientEmail).success) {
      throw new Error("The saved email address is not valid. Update the client email before sending.");
    }

    const { data: footerSettings } = await supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle();
    const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") || "";
    const emailEventId = crypto.randomUUID();
    const trackingPixelUrl = appBaseUrl ? `${appBaseUrl}/track/pixel/${quote.id}?email_event_id=${emailEventId}` : null;
    const email = buildQuoteEmail(quote, footerSettings?.value, { trackingPixelUrl });
    subject = email.subject;

    const sent = await sendBrevoEmail({
      toEmail: normalizedRecipientEmail,
      toName: quote.clients?.name ?? recipientEmail,
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      tags: ["quote", quote.quote_id_formatted]
    });

    const sentVia = Array.from(new Set([...(quote.sent_via ?? []), "email"]));
    const now = new Date().toISOString();

    await supabase.from("email_events").insert({
      id: emailEventId,
      quote_id: quote.id,
      client_id: quote.client_id,
      recipient_email: recipientEmail,
      subject: email.subject,
      provider: "brevo",
      template_key: "quote_manual_send",
      status: "sent",
      provider_message_id: sent.messageId ?? null,
      sent_at: now,
      sent_by: profile.id
    });

    await supabase
      .from("quotes")
      .update({
        status: quote.status === "draft" ? "sent" : quote.status,
        sent_date: now,
        sent_via: sentVia,
        sent_by: profile.id
      })
      .eq("id", quote.id);

    await autoEnrollQuoteInMatchingDrips({
      quoteId: quote.id,
      actorId: profile.id,
      actorName: profile.full_name
    });

    await supabase.from("activity_log").insert({
      user_id: profile.id,
      user_email: profile.email,
      action_type: "quote_sent",
      related_client_id: quote.client_id,
      related_quote_id: quote.id,
      details: {
        quote_id_formatted: quote.quote_id_formatted,
        channel: "email",
        provider: "brevo",
        subject,
        by: profile.email
      }
    });

    revalidatePath(`/quotes/${quote.id}`);
    revalidatePath("/quotes");
    revalidatePath("/pipeline");
    revalidatePath("/campaigns");

    return { ok: true, message: "Quote email sent." };
  } catch (error) {
    if (quote) {
      await supabase.from("email_events").insert({
        id: crypto.randomUUID(),
        quote_id: quote.id,
        client_id: quote.client_id,
        recipient_email: recipientEmail || null,
        subject: subject || null,
        provider: "brevo",
        template_key: "quote_manual_send",
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: error instanceof Error ? error.message : "Could not send quote email.",
        sent_by: profile.id
      });
    }

    return { ok: false, message: error instanceof Error ? error.message : "Could not send quote email." };
  }
}

type ServiceFeeOverrides = Record<string, { prepaid_fee?: number; postpaid_fee?: number; first_installment?: number; retainership_fee?: number; quantity?: number; unit_label?: "units" | "year" | "nos" }>;

function parseServiceFeeOverrides(value: string): ServiceFeeOverrides {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;
  const overrides: ServiceFeeOverrides = {};

  Object.entries(record).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const item = raw as Record<string, unknown>;
    const prepaidFee = Number(item.prepaid_fee);
    const postpaidFee = Number(item.postpaid_fee);
    const firstInstallment = Number(item.first_installment);
    const retainershipFee = Number(item.retainership_fee);
    const quantity = Number(item.quantity);
    const unitLabel = item.unit_label === "year" || item.unit_label === "nos" ? item.unit_label : item.unit_label === "units" ? "units" : undefined;
    overrides[id] = {
      prepaid_fee: Number.isFinite(prepaidFee) ? Math.max(0, Math.round(prepaidFee)) : undefined,
      postpaid_fee: Number.isFinite(postpaidFee) ? Math.max(0, Math.round(postpaidFee)) : undefined,
      first_installment: Number.isFinite(firstInstallment) ? Math.max(0, Math.round(firstInstallment)) : undefined,
      retainership_fee: Number.isFinite(retainershipFee) ? Math.max(0, Math.round(retainershipFee)) : undefined,
      quantity: Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : undefined,
      unit_label: unitLabel
    };
  });

  return overrides;
}

function parseStringArray(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function parseCustomServices(value: string): CustomServiceItem[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.reduce<CustomServiceItem[]>((items, item) => {
    if (!item || typeof item !== "object") return items;
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();
      const prepaidFee = Number(record.prepaid_fee ?? 0);
      const postpaidFee = Number(record.postpaid_fee ?? 0);
      const requiredDocuments = String(record.required_documents ?? "").trim();
    if (!name) return items;

    items.push({
        name,
        description,
        prepaid_fee: Number.isFinite(prepaidFee) ? prepaidFee : 0,
        postpaid_fee: Number.isFinite(postpaidFee) ? postpaidFee : 0,
        required_documents: requiredDocuments
    });

    return items;
  }, []);
}

function parseAddons(value: string): QuoteAddon[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const description = String(record.description ?? "").trim();
      const amount = Number(record.amount ?? 0);
      if (!description && amount <= 0) return null;
      return { description, amount };
    })
    .filter((item): item is QuoteAddon => Boolean(item));
}

function parseOtherFees(value: string): QuoteFeeItem[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const description = String(record.description ?? "").trim();
      const amount = Number(record.amount ?? 0);
      if (!description && amount === 0) return null;
      return { description, amount: Number.isFinite(amount) ? Math.round(amount) : 0 };
    })
    .filter((item): item is QuoteFeeItem => Boolean(item));
}

type QuoteDocumentItem = {
  id: string;
  label: string;
  kind: StructuredDocumentLine["kind"];
  source: string;
  serviceName?: string;
};

function parseDocumentItems(value: string): QuoteDocumentItem[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.reduce<QuoteDocumentItem[]>((items, item, index) => {
    if (!item || typeof item !== "object") return items;
    const record = item as Record<string, unknown>;
    const kind = record.kind === "heading" || record.kind === "break" ? record.kind : "item";
    const label = String(record.label ?? "").trim();
    if (!label && kind !== "break") return items;
    items.push({
      id: String(record.id ?? `document-${index}`),
      label,
      kind,
      source: String(record.source ?? "custom"),
      serviceName: typeof record.serviceName === "string" ? record.serviceName : undefined
    });
    return items;
  }, []);
}

type CannedNoteItem = {
  id: string;
  title: string;
  category: string;
  body: string;
};

function parseCannedNoteItems(value: string): CannedNoteItem[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const body = String(record.body ?? "").trim();
      if (!body) return null;
      return {
        id: String(record.id ?? ""),
        title: String(record.title ?? "Saved note").trim(),
        category: String(record.category ?? "General").trim(),
        body
      };
    })
    .filter((item): item is CannedNoteItem => Boolean(item));
}

function parsePreviewOverrides(value: string): QuotePreviewCopy {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") return defaultQuotePreviewCopy;
  const record = parsed as Partial<Record<keyof QuotePreviewCopy, unknown>>;

  return {
    greeting: asText(record.greeting, defaultQuotePreviewCopy.greeting),
    validity: asText(record.validity, defaultQuotePreviewCopy.validity),
    investmentNote: asText(record.investmentNote, defaultQuotePreviewCopy.investmentNote),
    includedNote: asText(record.includedNote, defaultQuotePreviewCopy.includedNote),
    refundPolicy: asText(record.refundPolicy, defaultQuotePreviewCopy.refundPolicy),
    whoWeAre: asText(record.whoWeAre, defaultQuotePreviewCopy.whoWeAre),
    whoWeAreSubtext: asText(record.whoWeAreSubtext, defaultQuotePreviewCopy.whoWeAreSubtext),
    signatureQuestion: asText(record.signatureQuestion, defaultQuotePreviewCopy.signatureQuestion)
  };
}

function asText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function splitTags(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Find a client that already owns one of the provided emails or mobiles.
 *
 * Phase 5 perf rewrite: previously this paginated up to 20,000 contact rows
 * on every new-client quote and filtered in JS. After migration 0013 the
 * contact_details table has normalized_* columns kept in sync by a trigger,
 * so we can do a tiny indexed lookup per channel instead.
 *
 * Falls back to the legacy scan when the normalized columns aren't there yet
 * (i.e. the migration hasn't been run) so the create-quote flow keeps working
 * during the rollout window. The fallback uses a much smaller LIMIT than
 * before — at that point we've already paid the query cost, so we may as
 * well be cheap about it.
 */
async function findMatchingClientId(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    primary_email?: string | null;
    secondary_email?: string | null;
    primary_mobile?: string | null;
    secondary_mobile?: string | null;
  }
) {
  const lookup = buildContactLookup(input);
  if (!lookup.emails.length && !lookup.mobiles.length) return null;

  // Build an OR filter against the normalized columns. We check primary +
  // secondary on both channels so two clients with overlapping aliases still
  // surface; the first match wins (consistent with the previous behaviour).
  const orClauses: string[] = [];
  for (const email of lookup.emails) {
    const escaped = email.replace(/"/g, "");
    orClauses.push(`normalized_primary_email.eq.${escaped}`);
    orClauses.push(`normalized_secondary_email.eq.${escaped}`);
  }
  for (const mobile of lookup.mobiles) {
    const escaped = mobile.replace(/"/g, "");
    orClauses.push(`normalized_primary_mobile.eq.${escaped}`);
    orClauses.push(`normalized_secondary_mobile.eq.${escaped}`);
    orClauses.push(`normalized_whatsapp_number.eq.${escaped}`);
  }

  if (orClauses.length) {
    const { data: indexed, error: indexedError } = await supabase
      .from("contact_details")
      .select("client_id")
      .or(orClauses.join(","))
      .limit(5);

    if (!indexedError) {
      return indexed?.[0]?.client_id ?? null;
    }

    // Only fall back if the error looks like "column does not exist"; any
    // other error means the indexed path was reachable and the legacy scan
    // would only repeat the same failure.
    const lower = (indexedError.message ?? "").toLowerCase();
    if (!lower.includes("column") && !lower.includes("schema cache")) {
      console.error("[findMatchingClientId] indexed lookup failed:", indexedError);
      return null;
    }
  }

  // ---- Legacy fallback (pre-migration-0013) -------------------------------
  // Tighter limit than the old 20k — we're still paying the cost, no need to
  // pay it on the entire table. Most "match by alias" cases are recent.
  const { data: contacts } = await supabase
    .from("contact_details")
    .select(
      "client_id,primary_email,secondary_email,historical_emails,primary_mobile,secondary_mobile,historical_mobiles,whatsapp_number"
    )
    .order("last_updated", { ascending: false })
    .limit(2000);

  const matchingClientIds = (contacts ?? [])
    .filter((contact) => matchesNormalizedContact(contact, lookup))
    .map((contact) => contact.client_id);
  const uniqueClientIds = [...new Set(matchingClientIds)];

  return uniqueClientIds[0] ?? null;
}

function mergeTags(nextTags: string[], existingTags: string[]) {
  return [...new Set([...(existingTags ?? []), ...(nextTags ?? [])])];
}

function normalizeReferenceCode(value: string) {
  return value.trim().replace(/\s+/g, "-").toUpperCase();
}

/**
 * Supersede only those open quotes for the same client whose service set is the
 * SAME as the new quote's service set. Anything else (different services, or
 * any free-text custom services on the existing quote) is left as-is and can
 * still be marked superseded manually from the pipeline.
 *
 * Why exact match (not subset / superset): partial overlaps are ambiguous in
 * the user's mental model. A quote that includes GST + Trademark is not really
 * "replaced" by a new GST-only quote. The safe automatic case is when the user
 * is clearly re-pricing the same scope of work.
 */
async function supersedeMatchingClientQuotes(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  newServiceIds: string[]
) {
  if (!clientId || !newServiceIds.length) return;

  const supersedableStatuses = ["draft", "sent", "viewed", "negotiating", "expired", "refresh_requested"];
  const { data: openQuotes, error: openQuotesError } = await supabase
    .from("quotes")
    .select("id,custom_service_items,quotes_services(service_id)")
    .eq("client_id", clientId)
    .in("status", supersedableStatuses);

  if (openQuotesError || !openQuotes?.length) return;

  const newSet = new Set(newServiceIds);
  const toSupersede: string[] = [];

  for (const quote of openQuotes as Array<{
    id: string;
    custom_service_items: unknown;
    quotes_services: Array<{ service_id: string }> | null;
  }>) {
    // Skip quotes that have any free-text custom services — we cannot reliably
    // compare those to the new quote, and superseding silently would be worse
    // than leaving them open.
    const customItems = Array.isArray(quote.custom_service_items) ? quote.custom_service_items : [];
    if (customItems.length) continue;

    const existingServiceIds = (quote.quotes_services ?? []).map((row) => row.service_id);
    if (!existingServiceIds.length) continue;
    if (existingServiceIds.length !== newSet.size) continue;

    const sameSet = existingServiceIds.every((id) => newSet.has(id));
    if (sameSet) toSupersede.push(quote.id);
  }

  if (!toSupersede.length) return;

  await supabase
    .from("quotes")
    .update({ status: "superseded" })
    .in("id", toSupersede);
}
