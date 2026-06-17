import { normalizeEmail, normalizeMobile } from "@/lib/contacts";
import { splitLeadTags } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export type LeadIngestSource = "google_form" | "google_sheet" | "meta_lead_ads" | "website_form" | "whatsapp_inbox" | "manual_import";

export type NormalizedLeadIngest = {
  source: LeadIngestSource;
  payload: unknown;
  quality?: number;
  cin?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  directorName?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  whatsappNumber?: string | null;
  remarks?: string | null;
  complianceNotes?: string | null;
  tags?: string[];
  leadSource?: string | null;
  intakeLabel?: string | null;
  status?: string | null;
  nextFollowUpAt?: string | null;
  nextFollowUpNote?: string | null;
  externalId?: string | null;
  formName?: string | null;
  sourceCreatedAt?: string | null;
  normalizedPayload?: Record<string, unknown>;
};

export type LeadIngestResult = {
  assignedTo: string | null;
  created: boolean;
  duplicate: boolean;
  eventId: string | null;
  leadCode: string;
  leadId: string;
};

export type MetaLeadAdsEnv = {
  accessToken: string;
  verifyToken: string;
  graphVersion: string;
};

export type MetaLeadWebhookChange = {
  adId: string | null;
  createdTime: string | null;
  formId: string | null;
  leadgenId: string;
  pageId: string | null;
  raw: Record<string, unknown>;
};

type LeadMatch = {
  assigned_to: string | null;
  cin: string | null;
  company_name: string;
  compliance_notes: string | null;
  contact_name: string | null;
  created_by: string | null;
  director_name: string | null;
  email: string | null;
  id: string;
  lead_code: string;
  meta: unknown;
  next_follow_up_at: string | null;
  next_follow_up_note: string | null;
  phone: string;
  alternate_phone: string | null;
  quality: number | null;
  remarks: string | null;
  source: string;
  status: string;
  tags: string[] | null;
  updated_by: string | null;
  whatsapp_number: string | null;
};

type LeadAssignee = {
  full_name: string;
  id: string;
  role: string;
};

const metaFieldAliases = {
  alternatePhone: ["alternate_phone", "alternate phone", "secondary_phone", "secondary phone"],
  companyName: ["company_name", "company name", "business_name", "business name", "organization", "organisation", "firm name"],
  contactName: ["full_name", "full name", "name", "contact_name", "contact name"],
  directorName: ["director_name", "director name", "owner_name", "owner name", "founder_name", "founder name"],
  email: ["email", "email_address", "email address", "work_email", "business email"],
  phone: ["phone", "phone_number", "phone number", "mobile", "mobile_number", "mobile number"],
  whatsappNumber: ["whatsapp", "whatsapp_number", "whatsapp number", "wa_number", "wa number"]
} as const;

export function getMetaLeadAdsEnv(): MetaLeadAdsEnv | null {
  const accessToken = process.env.META_LEAD_ACCESS_TOKEN;
  const verifyToken = process.env.META_LEAD_VERIFY_TOKEN;

  if (!accessToken || !verifyToken) return null;

  return {
    accessToken,
    verifyToken,
    graphVersion: process.env.META_GRAPH_VERSION || "v23.0"
  };
}

export function leadIntakeSourceLabel(source: LeadIngestSource) {
  if (source === "meta_lead_ads") return "Meta";
  if (source === "google_form") return "Google Form";
  if (source === "google_sheet") return "Google Sheet";
  if (source === "website_form") return "Website";
  if (source === "whatsapp_inbox") return "WhatsApp";
  return "Manual";
}

export function buildGoogleFormAnswerMap(value: unknown) {
  const map = new Map<string, string[]>();

  const register = (key: string, rawValue: unknown) => {
    const normalizedKey = normalizeAnswerKey(key);
    if (!normalizedKey) return;
    const values = normalizeAnswerValues(rawValue);
    if (!values.length) return;
    map.set(normalizedKey, values);
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const record = entry as Record<string, unknown>;
      const key = stringOrNull(record.question) || stringOrNull(record.name) || stringOrNull(record.label) || stringOrNull(record.title);
      if (!key) return;
      register(key, record.value ?? record.values ?? record.answer);
    });
    return map;
  }

  const record = asRecord(value);
  if (!record) return map;

  Object.entries(record).forEach(([key, rawValue]) => register(key, rawValue));
  return map;
}

export function normalizeGoogleFormSubmission(payload: unknown): NormalizedLeadIngest {
  const record = asRecord(payload);
  const answerMap = buildGoogleFormAnswerMap(record?.answers ?? record?.fields ?? record?.values ?? {});
  const questionTitles = [...answerMap.keys()];
  const companyName = pickAnswer(answerMap, metaFieldAliases.companyName);
  const contactName = pickAnswer(answerMap, metaFieldAliases.contactName);
  const directorName = pickAnswer(answerMap, metaFieldAliases.directorName);
  const email = pickAnswer(answerMap, metaFieldAliases.email);
  const phone = pickAnswer(answerMap, metaFieldAliases.phone);
  const alternatePhone = pickAnswer(answerMap, metaFieldAliases.alternatePhone);
  const whatsappNumber = pickAnswer(answerMap, metaFieldAliases.whatsappNumber) || phone;
  const formName = stringOrNull(record?.form_name) || stringOrNull(record?.form_title) || stringOrNull(record?.formName);
  const formId = stringOrNull(record?.form_id) || stringOrNull(record?.formId);
  const responseId = stringOrNull(record?.response_id) || stringOrNull(record?.responseId) || stringOrNull(record?.entry_id);
  const submittedAt = stringOrNull(record?.submitted_at) || stringOrNull(record?.submittedAt) || stringOrNull(record?.timestamp);
  const fallbackNotes = buildFormAnswerSummary(answerMap);
  const notes = [stringOrNull(record?.notes), fallbackNotes].filter(Boolean).join("\n\n") || null;

  return {
    source: "google_form",
    payload,
    quality: 3,
    companyName,
    contactName,
    directorName,
    email,
    phone,
    alternatePhone,
    whatsappNumber,
    remarks: notes,
    tags: splitLeadTags([formName, "google-form"].filter(Boolean).join(",")),
    externalId: responseId ? [formId, responseId].filter(Boolean).join(":") : formId || null,
    formName: formName || (formId ? `Google Form ${formId}` : "Google Form"),
    sourceCreatedAt: submittedAt,
    normalizedPayload: {
      answer_keys: questionTitles,
      answers: Object.fromEntries([...answerMap.entries()].map(([key, values]) => [key, values.join(", ")])),
      form_id: formId,
      form_name: formName,
      response_id: responseId
    }
  };
}

export function extractMetaLeadChanges(payload: unknown) {
  const changes: MetaLeadWebhookChange[] = [];
  const root = asRecord(payload);
  const entries = toArray<Record<string, unknown>>(root?.entry);

  entries.forEach((entry) => {
    toArray<Record<string, unknown>>(entry.changes).forEach((change) => {
      const value = asRecord(change.value);
      const field = stringOrNull(change.field);
      const leadgenId = stringOrNull(value?.leadgen_id);
      if (!leadgenId || (field && field !== "leadgen")) return;

      changes.push({
        adId: stringOrNull(value?.ad_id),
        createdTime: stringOrNull(value?.created_time),
        formId: stringOrNull(value?.form_id),
        leadgenId,
        pageId: stringOrNull(value?.page_id),
        raw: value ?? {}
      });
    });
  });

  return changes;
}

export async function fetchMetaLeadSubmission(leadgenId: string) {
  const env = getMetaLeadAdsEnv();
  if (!env) {
    throw new Error("Meta lead ads are not configured. Add META_LEAD_ACCESS_TOKEN and META_LEAD_VERIFY_TOKEN.");
  }

  const fields = ["id", "created_time", "ad_id", "form_id", "field_data"].join(",");
  const url = new URL(`https://graph.facebook.com/${env.graphVersion}/${leadgenId}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", env.accessToken);

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Meta lead fetch failed with ${response.status}.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export function normalizeMetaLeadSubmission(payload: unknown, change: MetaLeadWebhookChange): NormalizedLeadIngest {
  const record = asRecord(payload);
  const fieldMap = new Map<string, string[]>();

  toArray<Record<string, unknown>>(record?.field_data).forEach((field) => {
    const name = normalizeAnswerKey(stringOrNull(field.name) || "");
    const values = normalizeAnswerValues(field.values);
    if (!name || !values.length) return;
    fieldMap.set(name, values);
  });

  const companyName = pickAnswer(fieldMap, metaFieldAliases.companyName);
  const contactName = pickAnswer(fieldMap, metaFieldAliases.contactName);
  const directorName = pickAnswer(fieldMap, metaFieldAliases.directorName);
  const email = pickAnswer(fieldMap, metaFieldAliases.email);
  const phone = pickAnswer(fieldMap, metaFieldAliases.phone);
  const alternatePhone = pickAnswer(fieldMap, metaFieldAliases.alternatePhone);
  const whatsappNumber = pickAnswer(fieldMap, metaFieldAliases.whatsappNumber) || phone;
  const formId = stringOrNull(record?.form_id) || change.formId;
  const adId = stringOrNull(record?.ad_id) || change.adId;
  const notes = [
    formId ? `Form ID: ${formId}` : "",
    adId ? `Ad ID: ${adId}` : "",
    change.pageId ? `Page ID: ${change.pageId}` : "",
    buildFormAnswerSummary(fieldMap)
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    source: "meta_lead_ads",
    payload: {
      change: change.raw,
      lead: payload
    },
    quality: 4,
    companyName,
    contactName,
    directorName,
    email,
    phone,
    alternatePhone,
    whatsappNumber,
    remarks: notes || null,
    tags: splitLeadTags(["meta-lead-ad", formId ? `form-${formId}` : ""].filter(Boolean).join(",")),
    externalId: change.leadgenId,
    formName: formId ? `Meta form ${formId}` : "Meta instant form",
    sourceCreatedAt: stringOrNull(record?.created_time) || change.createdTime,
    normalizedPayload: {
      ad_id: adId,
      field_data: Object.fromEntries([...fieldMap.entries()].map(([key, values]) => [key, values.join(", ")])),
      form_id: formId,
      leadgen_id: change.leadgenId,
      page_id: change.pageId
    }
  };
}

export function normalizeDirectLeadSubmission(payload: unknown): NormalizedLeadIngest {
  const record = asRecord(payload);
  const sourceValue = stringOrNull(record?.source);
  const source = sourceValue === "website_form" || sourceValue === "meta_lead_ads" || sourceValue === "google_form" || sourceValue === "whatsapp_inbox"
    ? sourceValue
    : "website_form";

  return {
    source,
    payload,
    quality: numberOrNull(record?.quality) ?? 3,
    companyName: stringOrNull(record?.company_name) || stringOrNull(record?.companyName),
    contactName: stringOrNull(record?.contact_name) || stringOrNull(record?.contactName),
    directorName: stringOrNull(record?.director_name) || stringOrNull(record?.directorName),
    email: stringOrNull(record?.email),
    phone: stringOrNull(record?.phone),
    alternatePhone: stringOrNull(record?.alternate_phone) || stringOrNull(record?.alternatePhone),
    whatsappNumber: stringOrNull(record?.whatsapp_number) || stringOrNull(record?.whatsappNumber) || stringOrNull(record?.phone),
    remarks: stringOrNull(record?.remarks) || stringOrNull(record?.notes),
    complianceNotes: stringOrNull(record?.compliance_notes) || stringOrNull(record?.complianceNotes),
    tags: splitLeadTags(stringOrNull(record?.tags) || ""),
    externalId: stringOrNull(record?.external_id) || stringOrNull(record?.externalId),
    formName: stringOrNull(record?.form_name) || stringOrNull(record?.formName),
    sourceCreatedAt: stringOrNull(record?.submitted_at) || stringOrNull(record?.source_created_at) || stringOrNull(record?.sourceCreatedAt),
    normalizedPayload: {
      source,
      source_label: stringOrNull(record?.source_label) || null
    }
  };
}

export async function ingestLeadSubmission(input: NormalizedLeadIngest): Promise<LeadIngestResult> {
  const supabase = createAdminClient();
  const now = new Date();
  const sourceLabel = leadIntakeSourceLabel(input.source);
  const normalized = normalizeLeadInput(input, sourceLabel);
  const existingEvent = normalized.externalId
    ? await supabase
        .from("lead_ingest_events")
        .select("id,lead_id,assigned_to,processing_status")
        .eq("source", input.source)
        .eq("external_id", normalized.externalId)
        .maybeSingle()
    : { data: null, error: null };

  if (existingEvent.error) {
    throw new Error(existingEvent.error.message);
  }

  if (
    existingEvent.data?.lead_id &&
    (existingEvent.data.processing_status === "processed" || existingEvent.data.processing_status === "duplicate")
  ) {
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .select("id,lead_code")
      .eq("id", existingEvent.data.lead_id)
      .maybeSingle();

    if (leadError || !leadRow) {
      throw new Error(leadError?.message ?? "Existing lead could not be loaded.");
    }

    return {
      assignedTo: existingEvent.data.assigned_to ?? null,
      created: false,
      duplicate: true,
      eventId: existingEvent.data.id,
      leadCode: String(leadRow.lead_code),
      leadId: String(leadRow.id)
    };
  }

  const { data: eventRow, error: eventError } = existingEvent.data?.id
    ? await supabase
        .from("lead_ingest_events")
        .update({
          assigned_to: null,
          error_text: null,
          form_name: normalized.formName,
          lead_id: null,
          normalized_payload: normalized.eventPayload,
          notes: null,
          payload: input.payload,
          processed_at: null,
          processing_status: "received",
          source_created_at: normalized.sourceCreatedAt
        })
        .eq("id", existingEvent.data.id)
        .select("id")
        .single()
    : await supabase
        .from("lead_ingest_events")
        .insert({
          source: input.source,
          source_label: sourceLabel,
          external_id: normalized.externalId,
          dedupe_key: normalized.dedupeKey,
          form_name: normalized.formName,
          source_created_at: normalized.sourceCreatedAt,
          payload: input.payload,
          normalized_payload: normalized.eventPayload,
          processing_status: "received"
        })
        .select("id")
        .single();

  if (eventError || !eventRow) {
    throw new Error(eventError?.message ?? "Lead intake event could not be stored.");
  }

  try {
    const existingLead = await findMatchingLead(supabase, normalized);
    const assignedTo = existingLead?.assigned_to ?? (await chooseLeadAssignee(supabase));
    const reminderAt = normalized.nextFollowUpAt || buildAutoReminderAt(normalized.sourceCreatedAt);
    const reminderNote = normalized.nextFollowUpNote || `${sourceLabel} lead follow-up`;

    if (existingLead) {
      const patch = buildLeadUpdatePatch(existingLead, normalized, assignedTo, reminderAt, reminderNote, eventRow.id);
      const { error: updateError } = await supabase.from("leads").update(patch).eq("id", existingLead.id);
      if (updateError) throw new Error(updateError.message);

      await ensureLeadReminder(supabase, existingLead.id, assignedTo, reminderAt, reminderNote);
      await appendLeadComment(
        supabase,
        existingLead.id,
        `Another ${sourceLabel.toLowerCase()} submission was merged into this lead${normalized.formName ? ` from ${normalized.formName}` : ""}.`
      );
      await syncLeadNextFollowUp(supabase, existingLead.id);
      await saveLeadIngestEvent(supabase, eventRow.id, {
        assigned_to: assignedTo,
        lead_id: existingLead.id,
        notes: `Merged into lead ${existingLead.lead_code}.`,
        processed_at: now.toISOString(),
        processing_status: "duplicate"
      });
      await logLeadIntake(supabase, {
        assignedTo,
        created: false,
        formName: normalized.formName,
        leadCode: existingLead.lead_code,
        leadId: existingLead.id,
        source: sourceLabel
      });

      return {
        assignedTo,
        created: false,
        duplicate: true,
        eventId: eventRow.id,
        leadCode: existingLead.lead_code,
        leadId: existingLead.id
      };
    }

    const { data: createdLead, error: createError } = await supabase
      .from("leads")
      .insert({
        company_name: normalized.companyName,
        contact_name: normalized.contactName,
        director_name: normalized.directorName,
        cin: normalized.cin,
        email: normalized.email,
        phone: normalized.phone,
        alternate_phone: normalized.alternatePhone,
        whatsapp_number: normalized.whatsappNumber,
        source: normalized.leadSource,
        status: normalized.desiredStatus,
        quality: normalized.quality,
        assigned_to: assignedTo,
        created_by: assignedTo,
        updated_by: assignedTo,
        next_follow_up_at: reminderAt,
        next_follow_up_note: reminderNote,
        compliance_notes: normalized.complianceNotes,
        remarks: normalized.remarks,
        tags: normalized.tags,
        meta: {
          latest_intake: {
            at: now.toISOString(),
            event_id: eventRow.id,
            external_id: normalized.externalId,
            form_name: normalized.formName,
            source: input.source
          }
        }
      })
      .select("id,lead_code")
      .single();

    if (createError || !createdLead) {
      throw new Error(createError?.message ?? "Lead could not be created from intake.");
    }

    await ensureLeadReminder(supabase, createdLead.id, assignedTo, reminderAt, reminderNote);
    await appendLeadComment(
      supabase,
      createdLead.id,
      `Auto-captured from ${sourceLabel}${normalized.formName ? ` (${normalized.formName})` : ""}.`
    );
    await saveLeadIngestEvent(supabase, eventRow.id, {
      assigned_to: assignedTo,
      lead_id: createdLead.id,
      notes: `Created lead ${createdLead.lead_code}.`,
      processed_at: now.toISOString(),
      processing_status: "processed"
    });
    await logLeadIntake(supabase, {
      assignedTo,
      created: true,
      formName: normalized.formName,
      leadCode: createdLead.lead_code,
      leadId: createdLead.id,
      source: sourceLabel
    });

    return {
      assignedTo,
      created: true,
      duplicate: false,
      eventId: eventRow.id,
      leadCode: createdLead.lead_code,
      leadId: createdLead.id
    };
  } catch (error) {
    await saveLeadIngestEvent(supabase, eventRow.id, {
      error_text: error instanceof Error ? error.message : "Lead intake failed.",
      processed_at: now.toISOString(),
      processing_status: "failed"
    });
    throw error;
  }
}

async function findMatchingLead(
  supabase: ReturnType<typeof createAdminClient>,
  normalized: ReturnType<typeof normalizeLeadInput>
) {
  const phoneFilters = [normalized.normalizedPhone, normalized.normalizedAlternatePhone, normalized.normalizedWhatsapp]
    .filter(Boolean)
    .flatMap((value) => [
      `normalized_phone.eq.${value}`,
      `normalized_alternate_phone.eq.${value}`,
      `normalized_whatsapp_number.eq.${value}`
    ]);

  if (phoneFilters.length) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,lead_code,company_name,contact_name,director_name,compliance_notes,created_by,updated_by,assigned_to,status,source,phone,alternate_phone,whatsapp_number,email,quality,next_follow_up_at,next_follow_up_note,remarks,tags,meta"
      )
      .or(phoneFilters.join(","))
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data as LeadMatch;
  }

  if (normalized.email) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,lead_code,company_name,contact_name,director_name,compliance_notes,created_by,updated_by,assigned_to,status,source,phone,alternate_phone,whatsapp_number,email,quality,next_follow_up_at,next_follow_up_note,remarks,tags,meta"
      )
      .ilike("email", normalized.email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data as LeadMatch;
  }

  return null;
}

async function chooseLeadAssignee(supabase: ReturnType<typeof createAdminClient>) {
  const defaultAssigneeEmail = process.env.LEAD_DEFAULT_ASSIGNEE_EMAIL?.trim().toLowerCase();
  if (defaultAssigneeEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,role")
      .eq("email", defaultAssigneeEmail)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return String(data.id);
  }

  if (process.env.LEAD_AUTO_ASSIGN_MODE === "unassigned") {
    return null;
  }

  const configuredRoles = (process.env.LEAD_ROUTING_POOL_ROLES || "sales,executive")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const poolRoles = configuredRoles.length ? configuredRoles : ["sales", "executive"];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name,role")
    .eq("active", true)
    .in("role", poolRoles)
    .order("full_name");

  if (profileError) throw new Error(profileError.message);

  const leadAssignees = (profiles ?? []) as LeadAssignee[];
  if (!leadAssignees.length) {
    return null;
  }

  const assigneeIds = leadAssignees.map((profile) => profile.id);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);

  const { data: recentLeads, error: leadsError } = await supabase
    .from("leads")
    .select("assigned_to,created_at")
    .in("assigned_to", assigneeIds)
    .gte("created_at", cutoff.toISOString());

  if (leadsError) throw new Error(leadsError.message);

  const usageByAssignee = new Map<string, { count: number; lastAssignedAt: string | null }>();
  leadAssignees.forEach((profile) => usageByAssignee.set(profile.id, { count: 0, lastAssignedAt: null }));

  ((recentLeads ?? []) as Array<{ assigned_to: string | null; created_at: string | null }>).forEach((lead) => {
    if (!lead.assigned_to || !usageByAssignee.has(lead.assigned_to)) return;
    const usage = usageByAssignee.get(lead.assigned_to)!;
    usage.count += 1;
    if (!usage.lastAssignedAt || (lead.created_at && lead.created_at > usage.lastAssignedAt)) {
      usage.lastAssignedAt = lead.created_at;
    }
  });

  leadAssignees.sort((left, right) => {
    const leftUsage = usageByAssignee.get(left.id)!;
    const rightUsage = usageByAssignee.get(right.id)!;
    if (leftUsage.count !== rightUsage.count) return leftUsage.count - rightUsage.count;
    if (leftUsage.lastAssignedAt && rightUsage.lastAssignedAt && leftUsage.lastAssignedAt !== rightUsage.lastAssignedAt) {
      return leftUsage.lastAssignedAt < rightUsage.lastAssignedAt ? -1 : 1;
    }
    if (!leftUsage.lastAssignedAt && rightUsage.lastAssignedAt) return -1;
    if (leftUsage.lastAssignedAt && !rightUsage.lastAssignedAt) return 1;
    return left.full_name.localeCompare(right.full_name);
  });

  return leadAssignees[0]?.id ?? null;
}

async function ensureLeadReminder(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string,
  assignedTo: string | null,
  dueAt: string,
  note: string
) {
  const { data: existingReminder, error } = await supabase
    .from("lead_reminders")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existingReminder) return;

  const { error: insertError } = await supabase.from("lead_reminders").insert({
    lead_id: leadId,
    due_at: dueAt,
    note,
    assigned_to: assignedTo,
    created_by: assignedTo
  });

  if (insertError) throw new Error(insertError.message);
}

async function syncLeadNextFollowUp(supabase: ReturnType<typeof createAdminClient>, leadId: string) {
  const { data: nextReminder, error } = await supabase
    .from("lead_reminders")
    .select("due_at,note")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      next_follow_up_at: nextReminder?.due_at ?? null,
      next_follow_up_note: nextReminder?.note ?? null
    })
    .eq("id", leadId);

  if (updateError) throw new Error(updateError.message);
}

async function appendLeadComment(supabase: ReturnType<typeof createAdminClient>, leadId: string, body: string) {
  const { error } = await supabase.from("lead_comments").insert({
    lead_id: leadId,
    body,
    is_system: true
  });

  if (error) throw new Error(error.message);
}

async function saveLeadIngestEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabase.from("lead_ingest_events").update(patch).eq("id", eventId);
  if (error) throw new Error(error.message);
}

async function logLeadIntake(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    assignedTo: string | null;
    created: boolean;
    formName: string | null;
    leadCode: string;
    leadId: string;
    source: string;
  }
) {
  await supabase.rpc("log_activity", {
    action_type: input.created ? "lead_auto_created" : "lead_auto_merged",
    related_client_id: null,
    related_quote_id: null,
    details: {
      assigned_to: input.assignedTo,
      form_name: input.formName,
      lead_code: input.leadCode,
      lead_id: input.leadId,
      source: input.source
    }
  });
}

function buildLeadUpdatePatch(
  existingLead: LeadMatch,
  normalized: ReturnType<typeof normalizeLeadInput>,
  assignedTo: string | null,
  reminderAt: string,
  reminderNote: string,
  eventId: string
) {
  const nextPhone = choosePrimaryPhone(existingLead.phone, normalized.phone, normalized.whatsappNumber);
  const nextAlternatePhone = chooseAlternatePhone(existingLead, normalized);
  const nextWhatsapp = chooseFirstValue(existingLead.whatsapp_number, normalized.whatsappNumber, normalized.phone);
  const nextRemarks = mergeText(existingLead.remarks, normalized.remarks);
  const nextMeta = {
    ...(asRecord(existingLead.meta) ?? {}),
    latest_intake: {
      at: new Date().toISOString(),
      event_id: eventId,
      external_id: normalized.externalId,
      form_name: normalized.formName,
      source: normalized.inputSource
    }
  };

  return {
    assigned_to: existingLead.assigned_to || assignedTo,
        company_name: chooseFirstValue(existingLead.company_name, normalized.companyName),
        cin: chooseFirstValue(existingLead.cin, normalized.cin),
        compliance_notes: chooseFirstValue(existingLead.compliance_notes, normalized.complianceNotes),
        contact_name: chooseFirstValue(existingLead.contact_name, normalized.contactName, normalized.directorName),
        director_name: chooseFirstValue(existingLead.director_name, normalized.directorName, normalized.contactName),
        email: chooseFirstValue(existingLead.email, normalized.email),
        meta: nextMeta,
        next_follow_up_at: existingLead.next_follow_up_at || reminderAt,
        next_follow_up_note: existingLead.next_follow_up_note || reminderNote,
        phone: nextPhone,
        alternate_phone: nextAlternatePhone,
        quality: Math.max(existingLead.quality ?? 3, normalized.quality),
        remarks: nextRemarks,
        status: mergeLeadStatus(existingLead.status, normalized.desiredStatus),
        source: existingLead.source || normalized.leadSource,
        tags: uniqueTags(existingLead.tags ?? [], normalized.tags),
        updated_by: existingLead.updated_by || existingLead.assigned_to || assignedTo,
        whatsapp_number: nextWhatsapp
  };
}

function normalizeLeadInput(input: NormalizedLeadIngest, sourceLabel: string) {
  const email = normalizeEmail(input.email) || null;
  const phone = stringOrNull(input.phone) || null;
  const alternatePhone = stringOrNull(input.alternatePhone) || null;
  const whatsappNumber = stringOrNull(input.whatsappNumber) || phone;
  const leadSource = chooseFirstValue(input.leadSource, leadIntakeSourceLabel(input.source)) || "Manual";
  const intakeLabel = chooseFirstValue(input.intakeLabel, sourceLabel) || sourceLabel;
  const companyName = firstFilled(
    stringOrNull(input.companyName),
    stringOrNull(input.contactName),
    stringOrNull(input.directorName),
    stringOrNull(input.email),
    stringOrNull(input.phone),
    `${sourceLabel} lead`
  )!;
  const remarks = stringOrNull(input.remarks);
  const tags = uniqueTags(input.tags ?? []);
  const sourceCreatedAt = toIsoDateTime(input.sourceCreatedAt);
  const nextFollowUpAt = toIsoDateTime(input.nextFollowUpAt);

  return {
    alternatePhone,
    cin: stringOrNull(input.cin),
    companyName,
    complianceNotes: stringOrNull(input.complianceNotes),
    contactName: stringOrNull(input.contactName),
    dedupeKey: [normalizeMobile(phone), normalizeMobile(whatsappNumber), email].filter(Boolean).join("|") || null,
    directorName: stringOrNull(input.directorName),
    email,
    eventPayload: {
      ...(input.normalizedPayload ?? {}),
      company_name: companyName,
      email,
      phone,
      source_label: intakeLabel,
      whatsapp_number: whatsappNumber
    },
    desiredStatus: normalizeLeadStatus(input.status),
    externalId: stringOrNull(input.externalId),
    formName: stringOrNull(input.formName),
    inputSource: input.source,
    intakeLabel,
    leadSource,
    normalizedAlternatePhone: normalizeMobile(alternatePhone),
    normalizedPhone: normalizeMobile(phone),
    normalizedWhatsapp: normalizeMobile(whatsappNumber),
    nextFollowUpAt,
    nextFollowUpNote: stringOrNull(input.nextFollowUpNote),
    phone: phone || whatsappNumber || "Not provided",
    quality: clampQuality(input.quality),
    remarks,
    sourceCreatedAt,
    tags,
    whatsappNumber
  };
}

function choosePrimaryPhone(existingPhone: string | null, incomingPhone: string, incomingWhatsapp: string | null) {
  if (normalizeMobile(existingPhone)) return existingPhone || incomingPhone;
  return incomingPhone || incomingWhatsapp || existingPhone || "Not provided";
}

function chooseAlternatePhone(existingLead: LeadMatch, normalized: ReturnType<typeof normalizeLeadInput>) {
  const existingAlternate = normalizeMobile(existingLead.alternate_phone);
  if (existingAlternate) return existingLead.alternate_phone;

  const existingPrimary = normalizeMobile(existingLead.phone);
  const incomingOptions = [normalized.alternatePhone, normalized.whatsappNumber, normalized.phone]
    .map((value) => ({ normalized: normalizeMobile(value), value }))
    .filter((entry) => entry.normalized && entry.normalized !== existingPrimary);

  return incomingOptions[0]?.value || existingLead.alternate_phone;
}

function buildAutoReminderAt(sourceCreatedAt: string | null) {
  const hours = clampNumber(Number(process.env.LEAD_DEFAULT_FOLLOW_UP_HOURS || "2"), 0, 72);
  const base = sourceCreatedAt ? new Date(sourceCreatedAt) : new Date();
  const now = new Date();
  const safeBase = Number.isNaN(base.getTime()) || base.getTime() < now.getTime() ? now : base;
  safeBase.setHours(safeBase.getHours() + hours);
  return safeBase.toISOString();
}

function normalizeLeadStatus(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "new";
  if (raw === "new" || raw === "follow_up" || raw === "qualified" || raw === "quotation_sent" || raw === "nurture" || raw === "converted" || raw === "lost") {
    return raw;
  }
  return "new";
}

function mergeLeadStatus(existingStatus: string | null | undefined, incomingStatus: string | null | undefined) {
  const existing = normalizeLeadStatus(existingStatus);
  const incoming = normalizeLeadStatus(incomingStatus);
  const rank: Record<string, number> = {
    new: 1,
    follow_up: 2,
    nurture: 3,
    qualified: 4,
    quotation_sent: 5,
    converted: 6,
    lost: 6
  };

  return (rank[incoming] ?? 1) > (rank[existing] ?? 1) ? incoming : existing;
}

function buildFormAnswerSummary(answerMap: Map<string, string[]>) {
  const ignoredKeys = new Set<string>(
    [
      ...metaFieldAliases.companyName,
      ...metaFieldAliases.contactName,
      ...metaFieldAliases.directorName,
      ...metaFieldAliases.email,
      ...metaFieldAliases.phone,
      ...metaFieldAliases.alternatePhone,
      ...metaFieldAliases.whatsappNumber
    ].map(normalizeAnswerKey)
  );

  const lines = [...answerMap.entries()]
    .filter(([key]) => !ignoredKeys.has(key))
    .map(([key, values]) => `${titleCaseFromKey(key)}: ${values.join(", ")}`);

  return lines.length ? lines.join("\n") : "";
}

function pickAnswer(answerMap: Map<string, string[]>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const values = answerMap.get(normalizeAnswerKey(alias));
    if (values?.length) return values[0];
  }
  return null;
}

function normalizeAnswerValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  const stringValue = String(value ?? "").trim();
  return stringValue ? [stringValue] : [];
}

function normalizeAnswerKey(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function mergeText(existing: string | null, incoming: string | null) {
  const trimmedExisting = String(existing ?? "").trim();
  const trimmedIncoming = String(incoming ?? "").trim();
  if (!trimmedIncoming) return trimmedExisting || null;
  if (!trimmedExisting) return trimmedIncoming;
  if (trimmedExisting.includes(trimmedIncoming)) return trimmedExisting;
  return `${trimmedExisting}\n\n${trimmedIncoming}`;
}

function uniqueTags(...lists: Array<string[] | null | undefined>) {
  const seen = new Map<string, string>();
  lists.flat().forEach((tag) => {
    const trimmed = String(tag ?? "").trim();
    const normalized = trimmed.toLowerCase();
    if (!trimmed || seen.has(normalized)) return;
    seen.set(normalized, trimmed);
  });
  return [...seen.values()];
}

function chooseFirstValue(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function firstFilled(...values: Array<string | null | undefined>) {
  return chooseFirstValue(...values);
}

function clampQuality(value: number | undefined) {
  return clampNumber(Number(value ?? 3), 1, 5);
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function stringOrNull(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIsoDateTime(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function titleCaseFromKey(value: string) {
  return value
    .split(" ")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}
