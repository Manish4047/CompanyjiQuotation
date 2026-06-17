import "server-only";

import { sendBrevoEmail } from "@/lib/email/brevo";
import {
  buildDripEmail,
  calculateStepSchedule,
  campaignMatchesQuote,
  getNextStep,
  renderDripTemplate,
  type DripCampaignMatchInput,
  type DripStepInput,
  type QuoteMatchContext
} from "@/lib/drips";
import { parseQuoteFooterSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

type QuoteEnrollmentRow = {
  id: string;
  quote_id_formatted: string;
  client_id: string;
  status: string;
  total_amount: number;
  sent_date: string | null;
  validity_date: string | null;
  recommended_plan: string | null;
  clients: { name: string | null } | null;
  quotes_services:
    | Array<{
        service_id: string;
        services: { name: string | null } | null;
      }>
    | null;
};

type DripCampaignRow = DripCampaignMatchInput & {
  id: string;
  name: string;
  campaign_type: string;
  channel: "email" | "whatsapp" | "both";
  status: "draft" | "active" | "paused" | "archived";
  approval_status: "draft" | "approved" | "needs_review";
  template_category: string;
  stop_on_reply: boolean;
  stop_on_convert: boolean;
  stop_on_not_interested: boolean;
  pause_hours_after_reply: number;
  frequency_cap_days: number;
  dnd_respect: boolean;
};

type DripStepRow = DripStepInput & {
  id: string;
  campaign_id: string;
  active: boolean;
};

type ContactDetailsRow = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
  whatsapp_consent: boolean;
  do_not_contact: boolean;
  opt_outs: string[] | null;
};

type DueEnrollmentRow = {
  id: string;
  campaign_id: string;
  quote_id: string | null;
  client_id: string;
  source: string;
  channel: "email" | "whatsapp" | "both";
  status: "active" | "paused" | "stopped" | "completed";
  current_step: number;
  next_step_at: string | null;
  enrolled_at: string;
  trigger_snapshot: Record<string, unknown>;
  drip_campaigns: DripCampaignRow | DripCampaignRow[] | null;
  quotes:
    | ({
        id: string;
        quote_id_formatted: string;
        client_id: string;
        status: string;
        total_amount: number;
        sent_date: string | null;
        validity_date: string | null;
        recommended_plan: string | null;
        clients: { name: string | null } | null;
        quotes_services:
          | Array<{
              service_id: string;
              services: { name: string | null } | null;
            }>
          | null;
      } | null)
    | Array<{
        id: string;
        quote_id_formatted: string;
        client_id: string;
        status: string;
        total_amount: number;
        sent_date: string | null;
        validity_date: string | null;
        recommended_plan: string | null;
        clients: { name: string | null } | null;
        quotes_services:
          | Array<{
              service_id: string;
              services: { name: string | null } | null;
            }>
          | null;
      }>
    | null;
};

type RunDueDripsResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  stopped: number;
};

export async function autoEnrollQuoteInMatchingDrips({
  quoteId,
  actorId,
  actorName
}: {
  quoteId: string;
  actorId: string;
  actorName: string;
}) {
  const supabase = createAdminClient();
  const quote = await loadQuoteForEnrollment(supabase, quoteId);
  if (!quote || quote.status !== "sent") return 0;

  const { data: campaignData } = await supabase
    .from("drip_campaigns")
    .select(
      "id,name,campaign_type,trigger_type,channel,status,approval_status,template_category,service_ids,require_all_services,min_quote_amount,max_quote_amount,inactivity_days,stop_on_reply,stop_on_convert,stop_on_not_interested,pause_hours_after_reply,frequency_cap_days,dnd_respect"
    )
    .eq("status", "active")
    .eq("approval_status", "approved");

  const campaigns = (campaignData ?? []) as DripCampaignRow[];
  if (!campaigns.length) return 0;

  const matchingCampaigns = campaigns.filter((campaign) =>
    campaignMatchesQuote(campaign, buildQuoteMatchContext(quote, campaign.trigger_type))
  );
  if (!matchingCampaigns.length) return 0;

  const { data: stepData } = await supabase
    .from("drip_steps")
    .select("id,campaign_id,step_order,delay_amount,delay_unit,channel,subject,message,whatsapp_template_key,whatsapp_template_status,whatsapp_preview_text,active")
    .in(
      "campaign_id",
      matchingCampaigns.map((campaign) => campaign.id)
    )
    .eq("active", true)
    .order("step_order");

  const stepsByCampaignId = groupStepsByCampaign((stepData ?? []) as DripStepRow[]);
  let created = 0;

  for (const campaign of matchingCampaigns) {
    const firstStep = getNextStep(stepsByCampaignId[campaign.id] ?? [], 0);
    const { data: existingEnrollment } = await supabase
      .from("drip_enrollments")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("quote_id", quote.id)
      .in("status", ["active", "paused"])
      .maybeSingle();

    if (existingEnrollment) continue;

    const nextStepAt = firstStep ? calculateStepSchedule(quote.sent_date ?? new Date().toISOString(), firstStep) : null;
    const { data: enrollment } = await supabase
      .from("drip_enrollments")
      .insert({
        campaign_id: campaign.id,
        quote_id: quote.id,
        client_id: quote.client_id,
        source: "automatic",
        channel: campaign.channel,
        status: firstStep ? "active" : "completed",
        next_step_at: nextStepAt,
        trigger_snapshot: {
          salesperson_name: actorName,
          campaign_name: campaign.name,
          selected_service: getServiceNames(quote).join(", ")
        },
        created_by: actorId
      })
      .select("id")
      .single();

    if (!enrollment) continue;
    created += 1;

    if (firstStep) {
      await supabase.from("drip_events").insert({
        enrollment_id: enrollment.id,
        campaign_id: campaign.id,
        step_id: firstStep.id,
        quote_id: quote.id,
        client_id: quote.client_id,
        channel: firstStep.channel,
        event_type: "scheduled",
        message_excerpt: getStepPreviewText(firstStep),
        metadata: { next_step_at: nextStepAt },
        created_by: actorId
      });
    }
  }

  return created;
}

export async function manualEnrollQuoteInDrip({
  quoteId,
  campaignId,
  actorId,
  actorName
}: {
  quoteId: string;
  campaignId: string;
  actorId: string;
  actorName: string;
}) {
  const supabase = createAdminClient();
  const [quote, campaignResponse, stepResponse] = await Promise.all([
    loadQuoteForEnrollment(supabase, quoteId),
    supabase
      .from("drip_campaigns")
      .select(
        "id,name,campaign_type,trigger_type,channel,status,approval_status,template_category,service_ids,require_all_services,min_quote_amount,max_quote_amount,inactivity_days,stop_on_reply,stop_on_convert,stop_on_not_interested,pause_hours_after_reply,frequency_cap_days,dnd_respect"
      )
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("drip_steps")
      .select("id,campaign_id,step_order,delay_amount,delay_unit,channel,subject,message,whatsapp_template_key,whatsapp_template_status,whatsapp_preview_text,active")
      .eq("campaign_id", campaignId)
      .eq("active", true)
      .order("step_order")
  ]);

  const campaign = campaignResponse.data as DripCampaignRow | null;
  const steps = (stepResponse.data ?? []) as DripStepRow[];
  if (!quote) return { ok: false, message: "Quote not found." };
  if (!campaign) return { ok: false, message: "Drip campaign not found." };
  if (campaign.status === "archived") return { ok: false, message: "This drip campaign is archived." };

  const { data: existingEnrollment } = await supabase
    .from("drip_enrollments")
    .select("id,status")
    .eq("campaign_id", campaign.id)
    .eq("quote_id", quote.id)
    .in("status", ["active", "paused"])
    .maybeSingle();

  if (existingEnrollment) {
    return { ok: false, message: "This quote is already enrolled in that drip." };
  }

  const firstStep = getNextStep(steps, 0);
  const nextStepAt = firstStep ? calculateStepSchedule(new Date().toISOString(), firstStep) : null;
  const { data: enrollment, error } = await supabase
    .from("drip_enrollments")
    .insert({
      campaign_id: campaign.id,
      quote_id: quote.id,
      client_id: quote.client_id,
      source: "manual",
      channel: campaign.channel,
      status: firstStep ? "active" : "completed",
      next_step_at: nextStepAt,
      trigger_snapshot: {
        salesperson_name: actorName,
        campaign_name: campaign.name,
        selected_service: getServiceNames(quote).join(", ")
      },
      created_by: actorId
    })
    .select("id")
    .single();

  if (error || !enrollment) {
    return { ok: false, message: error?.message ?? "Could not enroll this quote." };
  }

  if (firstStep) {
    await supabase.from("drip_events").insert({
      enrollment_id: enrollment.id,
      campaign_id: campaign.id,
      step_id: firstStep.id,
      quote_id: quote.id,
      client_id: quote.client_id,
      channel: firstStep.channel,
      event_type: "scheduled",
      message_excerpt: getStepPreviewText(firstStep),
      metadata: { next_step_at: nextStepAt, source: "manual" },
      created_by: actorId
    });
  }

  return { ok: true, message: "Quote enrolled in drip campaign." };
}

export async function bulkEnrollQuotesInDrip({
  quoteIds,
  campaignId,
  actorId,
  actorName
}: {
  quoteIds: string[];
  campaignId: string;
  actorId: string;
  actorName: string;
}) {
  const uniqueQuoteIds = [...new Set(quoteIds.filter(Boolean))];
  if (!uniqueQuoteIds.length) {
    return { ok: false, enrolled: 0, skipped: 0, message: "No quotes were available for enrollment." };
  }

  const supabase = createAdminClient();
  const [campaignResponse, stepResponse, quoteResponse, enrollmentResponse] = await Promise.all([
    supabase
      .from("drip_campaigns")
      .select(
        "id,name,campaign_type,trigger_type,channel,status,approval_status,template_category,service_ids,require_all_services,min_quote_amount,max_quote_amount,inactivity_days,stop_on_reply,stop_on_convert,stop_on_not_interested,pause_hours_after_reply,frequency_cap_days,dnd_respect"
      )
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("drip_steps")
      .select("id,campaign_id,step_order,delay_amount,delay_unit,channel,subject,message,whatsapp_template_key,whatsapp_template_status,whatsapp_preview_text,active")
      .eq("campaign_id", campaignId)
      .eq("active", true)
      .order("step_order"),
    supabase
      .from("quotes")
      .select(
        "id,quote_id_formatted,client_id,status,total_amount,sent_date,validity_date,recommended_plan,clients(name),quotes_services(service_id,services(name))"
      )
      .in("id", uniqueQuoteIds),
    supabase
      .from("drip_enrollments")
      .select("quote_id")
      .eq("campaign_id", campaignId)
      .in("status", ["active", "paused"])
      .in("quote_id", uniqueQuoteIds)
  ]);

  const campaign = campaignResponse.data as DripCampaignRow | null;
  const steps = (stepResponse.data ?? []) as DripStepRow[];
  const existingQuoteIds = new Set((enrollmentResponse.data ?? []).map((enrollment) => String(enrollment.quote_id ?? "")));

  if (!campaign) {
    return { ok: false, enrolled: 0, skipped: uniqueQuoteIds.length, message: "Drip campaign not found." };
  }

  if (campaign.status === "archived") {
    return { ok: false, enrolled: 0, skipped: uniqueQuoteIds.length, message: "This drip campaign is archived." };
  }

  const eligibleQuotes = ((quoteResponse.data ?? []) as unknown[]).reduce<QuoteEnrollmentRow[]>((quotes, quoteRecord) => {
    const quote = normalizeQuote(quoteRecord);
    if (!quote) return quotes;
    if (existingQuoteIds.has(quote.id)) return quotes;
    if (["accepted", "spam", "superseded"].includes(quote.status)) return quotes;
    quotes.push(quote);
    return quotes;
  }, []);

  if (!eligibleQuotes.length) {
    return { ok: false, enrolled: 0, skipped: uniqueQuoteIds.length, message: "No eligible quotes were found for that drip." };
  }

  const firstStep = getNextStep(steps, 0);
  const now = new Date().toISOString();
  const nextStepAt = firstStep ? calculateStepSchedule(now, firstStep) : null;

  const { data: enrollments, error } = await supabase
    .from("drip_enrollments")
    .insert(
      eligibleQuotes.map((quote) => ({
        campaign_id: campaign.id,
        quote_id: quote.id,
        client_id: quote.client_id,
        source: "manual",
        channel: campaign.channel,
        status: firstStep ? "active" : "completed",
        next_step_at: nextStepAt,
        trigger_snapshot: {
          salesperson_name: actorName,
          campaign_name: campaign.name,
          selected_service: getServiceNames(quote).join(", ")
        },
        created_by: actorId
      }))
    )
    .select("id,quote_id,client_id");

  if (error) {
    return { ok: false, enrolled: 0, skipped: uniqueQuoteIds.length, message: error.message };
  }

  if (firstStep && enrollments?.length) {
    await supabase.from("drip_events").insert(
      enrollments.map((enrollment) => ({
        enrollment_id: enrollment.id,
        campaign_id: campaign.id,
        step_id: firstStep.id,
        quote_id: enrollment.quote_id,
        client_id: enrollment.client_id,
        channel: firstStep.channel,
        event_type: "scheduled",
        message_excerpt: getStepPreviewText(firstStep),
        metadata: { next_step_at: nextStepAt, source: "manual-list" },
        created_by: actorId
      }))
    );
  }

  return {
    ok: true,
    enrolled: enrollments?.length ?? 0,
    skipped: uniqueQuoteIds.length - (enrollments?.length ?? 0),
    message: `Enrolled ${enrollments?.length ?? 0} quotes into the drip.`
  };
}

export async function updateDripEnrollmentStatus({
  enrollmentId,
  status,
  reason
}: {
  enrollmentId: string;
  status: "active" | "paused" | "stopped";
  reason?: string;
}) {
  const supabase = createAdminClient();
  const { data: enrollment } = await supabase
    .from("drip_enrollments")
    .select("id,campaign_id,quote_id,client_id,current_step,next_step_at")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment) return { ok: false, message: "Drip enrollment not found." };

  let nextStepAt = enrollment.next_step_at;
  if (status === "active" && !nextStepAt) {
    const { data: stepsData } = await supabase
      .from("drip_steps")
      .select("id,campaign_id,step_order,delay_amount,delay_unit,channel,subject,message,whatsapp_template_key,whatsapp_template_status,whatsapp_preview_text,active")
      .eq("campaign_id", enrollment.campaign_id)
      .eq("active", true)
      .order("step_order");

    const nextStep = getNextStep((stepsData ?? []) as DripStepRow[], enrollment.current_step ?? 0);
    nextStepAt = nextStep ? calculateStepSchedule(new Date().toISOString(), nextStep) : null;
  }

  const { error } = await supabase
    .from("drip_enrollments")
    .update({
      status,
      next_step_at: status === "active" ? nextStepAt : null,
      stopped_at: status === "stopped" ? new Date().toISOString() : null,
      stop_reason: reason ?? null
    })
    .eq("id", enrollmentId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Drip ${status}.` };
}

export async function stopQuoteDrips({
  quoteId,
  reason,
  completed
}: {
  quoteId: string;
  reason: string;
  completed?: boolean;
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const nextStatus = completed ? "completed" : "stopped";

  const { data: enrollments } = await supabase
    .from("drip_enrollments")
    .select("id,campaign_id,client_id")
    .eq("quote_id", quoteId)
    .in("status", ["active", "paused"]);

  if (!enrollments?.length) return 0;

  await supabase
    .from("drip_enrollments")
    .update({
      status: nextStatus,
      next_step_at: null,
      stopped_at: now,
      stop_reason: reason
    })
    .eq("quote_id", quoteId)
    .in("status", ["active", "paused"]);

  await supabase.from("drip_events").insert(
    enrollments.map((enrollment) => ({
      enrollment_id: enrollment.id,
      campaign_id: enrollment.campaign_id,
      quote_id: quoteId,
      client_id: enrollment.client_id,
      channel: "both",
      event_type: "stopped",
      metadata: { reason }
    }))
  );

  return enrollments.length;
}

export async function runDueDrips({ actorId }: { actorId: string }) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const result: RunDueDripsResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    stopped: 0
  };

  const [{ data: enrollmentData }, { data: footerSettingsData }] = await Promise.all([
    supabase
      .from("drip_enrollments")
      .select(
        "id,campaign_id,quote_id,client_id,source,channel,status,current_step,next_step_at,enrolled_at,trigger_snapshot,drip_campaigns(id,name,campaign_type,trigger_type,channel,status,approval_status,template_category,service_ids,require_all_services,min_quote_amount,max_quote_amount,inactivity_days,stop_on_reply,stop_on_convert,stop_on_not_interested,pause_hours_after_reply,frequency_cap_days,dnd_respect),quotes(id,quote_id_formatted,client_id,status,total_amount,sent_date,validity_date,recommended_plan,clients(name),quotes_services(service_id,services(name)))"
      )
      .eq("status", "active")
      .lte("next_step_at", now)
      .order("next_step_at")
      .limit(50),
    supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle()
  ]);

  const enrollments = (enrollmentData ?? []) as unknown as DueEnrollmentRow[];
  if (!enrollments.length) return result;

  const clientIds = [...new Set(enrollments.map((enrollment) => enrollment.client_id))];
  const { data: contactData } = await supabase
    .from("contact_details")
    .select("client_id,primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number,whatsapp_consent,do_not_contact,opt_outs")
    .in("client_id", clientIds);
  const { data: suppressionData } = await supabase
    .from("reply_suppressions")
    .select("client_id,pause_until")
    .in("client_id", clientIds);

  const contactByClientId = new Map(
    ((contactData ?? []) as Array<ContactDetailsRow & { client_id: string }>).map((contact) => [contact.client_id, contact])
  );
  const replyPauseByClientId = new Map(
    ((suppressionData ?? []) as Array<{ client_id: string; pause_until: string | null }>).map((item) => [item.client_id, item.pause_until])
  );
  const footerLine = parseQuoteFooterSettings(footerSettingsData?.value).footerLine;
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") || "";

  for (const enrollment of enrollments) {
    result.processed += 1;
    const campaign = normalizeCampaign(enrollment.drip_campaigns);
    const quote = normalizeQuote(enrollment.quotes);
    if (!campaign || !quote) {
      result.failed += 1;
      continue;
    }
    if (campaign.status !== "active") {
      result.skipped += 1;
      continue;
    }

    if ((quote.status === "accepted" && campaign.stop_on_convert) || quote.status === "lost" || quote.status === "spam" || quote.status === "dormant") {
      await stopQuoteDrips({
        quoteId: quote.id,
        reason: `Quote moved to ${quote.status}.`,
        completed: quote.status === "accepted"
      });
      result.stopped += 1;
      continue;
    }

    const pauseUntil = replyPauseByClientId.get(enrollment.client_id);
    if (pauseUntil && new Date(pauseUntil).getTime() > Date.now()) {
      await supabase.from("drip_enrollments").update({ status: "paused", next_step_at: null, stop_reason: "Reply pause" }).eq("id", enrollment.id);
      result.skipped += 1;
      continue;
    }

    const { data: stepData } = await supabase
      .from("drip_steps")
      .select("id,campaign_id,step_order,delay_amount,delay_unit,channel,subject,message,whatsapp_template_key,whatsapp_template_status,whatsapp_preview_text,active")
      .eq("campaign_id", campaign.id)
      .eq("active", true)
      .order("step_order");

    const steps = (stepData ?? []) as DripStepRow[];
    const currentStep = Number(enrollment.current_step ?? 0);
    const step = getNextStep(steps, currentStep);
    if (!step) {
      await supabase.from("drip_enrollments").update({ status: "completed", next_step_at: null }).eq("id", enrollment.id);
      result.stopped += 1;
      continue;
    }

    const { data: latestSentEvent } = await supabase
      .from("drip_events")
      .select("occurred_at")
      .eq("enrollment_id", enrollment.id)
      .eq("event_type", "sent")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSentEvent?.occurred_at) {
      const lastSentAt = new Date(latestSentEvent.occurred_at).getTime();
      const capWindowMs = campaign.frequency_cap_days * 24 * 60 * 60 * 1000;
      if (Date.now() - lastSentAt < capWindowMs) {
        await supabase
          .from("drip_enrollments")
          .update({
            next_step_at: new Date(lastSentAt + capWindowMs).toISOString()
          })
          .eq("id", enrollment.id);
        result.skipped += 1;
        continue;
      }
    }

    const contact = contactByClientId.get(enrollment.client_id);
    const sendOutcome = await sendDripStep({
      supabase,
      actorId,
      enrollmentId: enrollment.id,
      campaign,
      step,
      quote,
      contact,
      footerLine,
      appBaseUrl,
      triggerSnapshot: enrollment.trigger_snapshot ?? {}
    });

    result.sent += sendOutcome.sent;
    result.skipped += sendOutcome.skipped;
    result.failed += sendOutcome.failed;

    const nextUpcomingStep = getNextStep(steps, step.step_order);
    await supabase
      .from("drip_enrollments")
      .update({
        current_step: step.step_order,
        last_step_at: now,
        next_step_at: nextUpcomingStep ? calculateStepSchedule(now, nextUpcomingStep) : null,
        status: nextUpcomingStep ? "active" : "completed"
      })
      .eq("id", enrollment.id);
  }

  return result;
}

async function sendDripStep({
  supabase,
  actorId,
  enrollmentId,
  campaign,
  step,
  quote,
  contact,
  footerLine,
  appBaseUrl,
  triggerSnapshot
}: {
  supabase: ReturnType<typeof createAdminClient>;
  actorId: string;
  enrollmentId: string;
  campaign: DripCampaignRow;
  step: DripStepRow;
  quote: QuoteEnrollmentRow;
  contact: ContactDetailsRow | undefined;
  footerLine: string;
  appBaseUrl: string;
  triggerSnapshot: Record<string, unknown>;
}) {
  const channels = expandChannels(step.channel === "both" ? campaign.channel : step.channel);
  const services = getServiceNames(quote);
  const variables = {
    clientName: quote.clients?.name || "there",
    companyName: quote.clients?.name || "",
    quoteNumber: quote.quote_id_formatted,
    selectedService: services.join(", "),
    quoteAmount: quote.total_amount,
    salespersonName: String(triggerSnapshot.salesperson_name ?? "Team Companyji"),
    validityDate: quote.validity_date,
    recommendedPlan: quote.recommended_plan
  };

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const channel of channels) {
    if (!contact || (campaign.dnd_respect && (contact.do_not_contact || contact.opt_outs?.includes("all")))) {
      await logDripEvent({
        supabase,
        enrollmentId,
        campaignId: campaign.id,
        stepId: step.id,
        quoteId: quote.id,
        clientId: quote.client_id,
        channel,
        eventType: "skipped",
        actorId,
        message: "Contact blocked by Do Not Contact or global opt-out."
      });
      skipped += 1;
      continue;
    }

    if (channel === "email") {
      const email = contact.primary_email || contact.secondary_email;
      if (!email) {
        await logDripEvent({
          supabase,
          enrollmentId,
          campaignId: campaign.id,
          stepId: step.id,
          quoteId: quote.id,
          clientId: quote.client_id,
          channel,
          eventType: "skipped",
          actorId,
          message: "No email saved for this lead."
        });
        skipped += 1;
        continue;
      }

      const emailEventId = crypto.randomUUID();
      const dripSentEventId = crypto.randomUUID();
      const subject = renderDripTemplate(step.subject || campaign.name, variables);
      const message = renderDripTemplate(step.message, variables);
      const trackingPixelUrl = appBaseUrl ? `${appBaseUrl}/track/pixel/${quote.id}?email_event_id=${emailEventId}&drip_event_id=${dripSentEventId}` : null;
      const built = buildDripEmail({
        subject,
        message,
        footerLine,
        trackingPixelUrl
      });

      try {
        const brevoResponse = await sendBrevoEmail({
          toEmail: email,
          toName: quote.clients?.name ?? email,
          subject,
          htmlContent: built.htmlContent,
          textContent: built.textContent,
          tags: ["drip", campaign.name]
        });

        await supabase.from("email_events").insert({
          id: emailEventId,
          quote_id: quote.id,
          client_id: quote.client_id,
          recipient_email: email,
          subject,
          provider: "brevo",
          template_key: `drip:${campaign.id}:step:${step.step_order}`,
          status: "sent",
          provider_message_id: brevoResponse.messageId ?? null,
          sent_at: new Date().toISOString(),
          sent_by: actorId
        });

        await logDripEvent({
          id: dripSentEventId,
          supabase,
          enrollmentId,
          campaignId: campaign.id,
          stepId: step.id,
          quoteId: quote.id,
          clientId: quote.client_id,
          channel,
          eventType: "sent",
          actorId,
          recipient: email,
          subject,
          message
        });
        sent += 1;
      } catch (error) {
        await supabase.from("email_events").insert({
          id: emailEventId,
          quote_id: quote.id,
          client_id: quote.client_id,
          recipient_email: email,
          subject,
          provider: "brevo",
          template_key: `drip:${campaign.id}:step:${step.step_order}`,
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: error instanceof Error ? error.message : "Could not send drip email.",
          sent_by: actorId
        });

        await logDripEvent({
          supabase,
          enrollmentId,
          campaignId: campaign.id,
          stepId: step.id,
          quoteId: quote.id,
          clientId: quote.client_id,
          channel,
          eventType: "failed",
          actorId,
          recipient: email,
          subject,
          message: error instanceof Error ? error.message : "Could not send drip email."
        });
        failed += 1;
      }

      continue;
    }

    const whatsappNumber = contact.whatsapp_number || contact.primary_mobile || contact.secondary_mobile;
    const whatsappTemplateKey = String(step.whatsapp_template_key ?? "").trim();
    const whatsappTemplateStatus = step.whatsapp_template_status ?? "draft";
    const whatsappPreviewText = renderDripTemplate(step.whatsapp_preview_text || step.message || "", variables);

    if (!whatsappTemplateKey) {
      await logDripEvent({
        supabase,
        enrollmentId,
        campaignId: campaign.id,
        stepId: step.id,
        quoteId: quote.id,
        clientId: quote.client_id,
        channel,
        eventType: "skipped",
        actorId,
        recipient: whatsappNumber || "",
        message: "No WhatsApp template is linked to this step."
      });
      skipped += 1;
      continue;
    }

    if (whatsappTemplateStatus !== "approved") {
      await logDripEvent({
        supabase,
        enrollmentId,
        campaignId: campaign.id,
        stepId: step.id,
        quoteId: quote.id,
        clientId: quote.client_id,
        channel,
        eventType: "skipped",
        actorId,
        recipient: whatsappNumber || "",
        message: `WhatsApp template ${whatsappTemplateKey} is ${whatsappTemplateStatus} and not ready to send.`
      });
      skipped += 1;
      continue;
    }

    if (!whatsappNumber || !contact.whatsapp_consent || !process.env.AISENSY_API_KEY) {
      await logDripEvent({
        supabase,
        enrollmentId,
        campaignId: campaign.id,
        stepId: step.id,
        quoteId: quote.id,
        clientId: quote.client_id,
        channel,
        eventType: "skipped",
        actorId,
        recipient: whatsappNumber || "",
        message: !whatsappNumber
          ? "No WhatsApp number saved."
          : !contact.whatsapp_consent
            ? "WhatsApp consent is not recorded."
            : `WhatsApp template ${whatsappTemplateKey} is ready, but the WhatsApp API is not configured yet.`
      });
      skipped += 1;
      continue;
    }

    await logDripEvent({
      supabase,
      enrollmentId,
      campaignId: campaign.id,
      stepId: step.id,
      quoteId: quote.id,
      clientId: quote.client_id,
      channel,
      eventType: "skipped",
      actorId,
      recipient: whatsappNumber,
      subject: whatsappTemplateKey,
      message: whatsappPreviewText || "WhatsApp sending is not connected yet. Configure AiSensy to activate this channel."
    });
    skipped += 1;
  }

  return { sent, skipped, failed };
}

async function logDripEvent({
  id,
  supabase,
  enrollmentId,
  campaignId,
  stepId,
  quoteId,
  clientId,
  channel,
  eventType,
  actorId,
  recipient,
  subject,
  message
}: {
  id?: string;
  supabase: ReturnType<typeof createAdminClient>;
  enrollmentId: string;
  campaignId: string;
  stepId: string | null;
  quoteId: string;
  clientId: string;
  channel: "email" | "whatsapp" | "both";
  eventType: "scheduled" | "sent" | "opened" | "clicked" | "replied" | "failed" | "skipped" | "stopped";
  actorId: string | null;
  recipient?: string;
  subject?: string;
  message?: string;
}) {
  await supabase.from("drip_events").insert({
    id: id ?? crypto.randomUUID(),
    enrollment_id: enrollmentId,
    campaign_id: campaignId,
    step_id: stepId,
    quote_id: quoteId,
    client_id: clientId,
    channel,
    event_type: eventType,
    recipient: recipient ?? null,
    subject: subject ?? null,
    message_excerpt: message ? message.slice(0, 180) : null,
    created_by: actorId
  });
}

async function loadQuoteForEnrollment(supabase: ReturnType<typeof createAdminClient>, quoteId: string) {
  const { data } = await supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,client_id,status,total_amount,sent_date,validity_date,recommended_plan,clients(name),quotes_services(service_id,services(name))"
    )
    .eq("id", quoteId)
    .maybeSingle();

  return normalizeQuote(data as unknown);
}

function buildQuoteMatchContext(quote: QuoteEnrollmentRow, triggerType: string): QuoteMatchContext {
  const sentDate = quote.sent_date ? new Date(quote.sent_date) : null;
  const inactiveDays = sentDate ? Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24)) : undefined;
  return {
    triggerType,
    quoteStatus: quote.status,
    serviceIds: (quote.quotes_services ?? []).map((item) => item.service_id),
    totalAmount: quote.total_amount,
    inactiveDays
  };
}

function getServiceNames(quote: QuoteEnrollmentRow) {
  return (quote.quotes_services ?? [])
    .map((item) => {
      const service = Array.isArray(item.services) ? item.services[0] ?? null : item.services;
      return service?.name || "";
    })
    .filter(Boolean);
}

function groupStepsByCampaign(steps: DripStepRow[]) {
  return steps.reduce<Record<string, DripStepRow[]>>((groups, step) => {
    groups[step.campaign_id] = [...(groups[step.campaign_id] ?? []), step];
    return groups;
  }, {});
}

function normalizeCampaign(value: DueEnrollmentRow["drip_campaigns"]) {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] ?? null) as DripCampaignRow | null;
  return value as DripCampaignRow;
}

function normalizeQuote(value: unknown) {
  if (!value) return null;
  const quote = Array.isArray(value) ? value[0] ?? null : value;
  if (!quote || typeof quote !== "object") return null;
  const record = quote as Record<string, unknown>;
  const clientValue = Array.isArray(record.clients) ? record.clients[0] ?? null : record.clients;
  const serviceValues = Array.isArray(record.quotes_services) ? record.quotes_services : [];

  return {
    id: String(record.id ?? ""),
    quote_id_formatted: String(record.quote_id_formatted ?? ""),
    client_id: String(record.client_id ?? ""),
    status: String(record.status ?? ""),
    total_amount: Number(record.total_amount ?? 0),
    sent_date: typeof record.sent_date === "string" ? record.sent_date : null,
    validity_date: typeof record.validity_date === "string" ? record.validity_date : null,
    recommended_plan: typeof record.recommended_plan === "string" ? record.recommended_plan : null,
    clients:
      clientValue && typeof clientValue === "object"
        ? {
            name: String((clientValue as Record<string, unknown>).name ?? "")
          }
        : null,
    quotes_services: serviceValues
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const relation = item as Record<string, unknown>;
        const serviceValue = Array.isArray(relation.services) ? relation.services[0] ?? null : relation.services;
        return {
          service_id: String(relation.service_id ?? ""),
          services:
            serviceValue && typeof serviceValue === "object"
              ? {
                  name: String((serviceValue as Record<string, unknown>).name ?? "")
                }
              : null
        };
      })
  };
}

function expandChannels(channel: "email" | "whatsapp" | "both") {
  if (channel === "both") return ["email", "whatsapp"] as const;
  return [channel] as const;
}

function getStepPreviewText(step: Pick<DripStepInput, "message" | "whatsapp_preview_text">) {
  return (step.message || step.whatsapp_preview_text || "").slice(0, 180);
}
