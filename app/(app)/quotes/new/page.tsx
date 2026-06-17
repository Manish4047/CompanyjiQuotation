import {
  QuoteBuilder,
  type QuoteBuilderLeadPrefill,
  type QuoteCannedMessageOption,
  type QuoteClientOption,
  type QuoteDefinedTagOption,
  type QuoteDocumentTemplateOption,
  type QuoteServiceOption,
  type QuoteServiceDocumentLink,
  type QuoteStateOption
} from "@/components/quotes/quote-builder";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { normalizeEmail, normalizeMobile } from "@/lib/contacts";
import { defaultCurrencyCode } from "@/lib/currency";
import { canAccessLeadRecord } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseQuoteFooterSettings } from "@/lib/settings";

export default async function NewQuotePage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; success?: string; lead?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const profile = await requireProfile();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const [
    { data: services, error: servicesError },
    { data: states },
    { data: footerSettings },
    { data: documentTemplates },
    { data: serviceDocumentLinks },
    { data: cannedMessages },
    { data: tagCategories },
    { data: definedTags },
    { data: clientRows }
  ] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id,name,category,short_description,full_description,pricing_mode,currency_code,prepaid_fee,postpaid_fee,retainership_fee,retainership_cycle,prepaid_description,postpaid_description,first_installment,first_trigger,second_trigger,state_variations_apply,required_documents,inclusions,timeline_typical,extra_costs_clause,is_addon_template"
      )
      .eq("active", true)
      .order("category")
      .order("name"),
    supabase.from("states").select("id,name,surcharge").order("name"),
    supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle(),
    supabase.from("document_templates").select("id,name,category").eq("active", true).order("category").order("name"),
    supabase.from("service_document_templates").select("service_id,document_template_id"),
    supabase.from("canned_messages").select("id,title,category,body,use_case").eq("active", true).order("category").order("title"),
    supabase.from("pipeline_tag_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("pipeline_tags").select("id,name,category_id").eq("active", true).order("sort_order").order("name"),
    adminSupabase
      .from("clients")
      .select("id,code,group_id,name,client_type,source,tags,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number)")
      .order("created_at", { ascending: false })
      .limit(500)
  ]);
  const leadPrefill = params.lead
    ? await loadLeadPrefill(adminSupabase, profile, params.lead)
    : null;
  const tagCategoryMap = new Map(((tagCategories ?? []) as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
  const tagOptions = ((definedTags ?? []) as Array<{ id: string; name: string; category_id: string | null }>).map((tag) => ({
    id: tag.id,
    name: tag.name,
    category_name: tag.category_id ? tagCategoryMap.get(tag.category_id) ?? "General" : "General"
  }));

  const clients = dedupeClientOptions((clientRows ?? []) as Array<
    QuoteClientOption & {
      contact_details:
        | {
            primary_email: string | null;
            secondary_email: string | null;
            primary_mobile: string | null;
            secondary_mobile: string | null;
            whatsapp_number: string | null;
          }
        | Array<{
            primary_email: string | null;
            secondary_email: string | null;
            primary_mobile: string | null;
            secondary_mobile: string | null;
            whatsapp_number: string | null;
          }>
        | null;
    }
  >);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Quote builder</p>
        <h1 className="mt-1 text-3xl font-black text-black">New quote</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Pick services like invoice line items, choose postpaid or prepaid, and let the app calculate state variation
          and add-ons clearly.
        </p>
      </header>
      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}
      {params.lead && leadPrefill ? <Notice tone="green">Lead details were loaded into the quote form.</Notice> : null}
      {params.lead && !leadPrefill ? <Notice tone="red">Lead could not be loaded for quote prefill.</Notice> : null}
      {servicesError ? <Notice tone="red">{friendlyServiceLoadError(servicesError.message)}</Notice> : null}
      <QuoteBuilder
        services={(services ?? []) as QuoteServiceOption[]}
        states={(states ?? []) as QuoteStateOption[]}
        clients={clients}
        footerSettings={parseQuoteFooterSettings(footerSettings?.value)}
        documentTemplates={(documentTemplates ?? []) as QuoteDocumentTemplateOption[]}
        serviceDocumentLinks={(serviceDocumentLinks ?? []) as QuoteServiceDocumentLink[]}
        cannedMessages={(cannedMessages ?? []) as QuoteCannedMessageOption[]}
        definedTags={tagOptions as QuoteDefinedTagOption[]}
        initialLead={leadPrefill}
      />
    </div>
  );
}

async function loadLeadPrefill(
  supabase: ReturnType<typeof createAdminClient>,
  profile: Awaited<ReturnType<typeof requireProfile>>,
  leadId: string
) {
  const { data, error } = await supabase
    .from("leads")
    .select("id,company_name,contact_name,director_name,email,phone,alternate_phone,whatsapp_number,source,tags,assigned_to,created_by,status")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data || !canAccessLeadRecord(profile, data)) {
    return null;
  }

  return data as QuoteBuilderLeadPrefill;
}

function dedupeClientOptions(
  clients: Array<
    QuoteClientOption & {
      contact_details:
        | {
            primary_email: string | null;
            secondary_email: string | null;
            primary_mobile: string | null;
            secondary_mobile: string | null;
            whatsapp_number: string | null;
          }
        | Array<{
            primary_email: string | null;
            secondary_email: string | null;
            primary_mobile: string | null;
            secondary_mobile: string | null;
            whatsapp_number: string | null;
          }>
        | null;
    }
  >
) {
  const seen = new Set<string>();
  const rows: QuoteClientOption[] = [];

  clients.forEach((client) => {
    const contact = Array.isArray(client.contact_details) ? client.contact_details[0] ?? null : client.contact_details;
    const identity =
      normalizeEmail(contact?.primary_email) ||
      normalizeEmail(contact?.secondary_email) ||
      normalizeMobile(contact?.primary_mobile) ||
      normalizeMobile(contact?.secondary_mobile) ||
      normalizeMobile(contact?.whatsapp_number) ||
      client.id;

    if (seen.has(identity)) return;
    seen.add(identity);
    rows.push({
      id: client.id,
      code: client.code,
      group_id: client.group_id,
      name: client.name,
      client_type: client.client_type,
      source: client.source,
      tags: client.tags,
      primary_mobile: contact?.primary_mobile ?? null,
      secondary_mobile: contact?.secondary_mobile ?? null
    });
  });

  return rows;
}

function friendlyServiceLoadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("column") || lower.includes("schema cache")) {
    return `Services could not load because the database is missing newer service fields. Run migrations 0002, 0003, 0004, and 0010 in Supabase SQL Editor. Default currency is ${defaultCurrencyCode}.`;
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "Services could not load because your user does not have permission. Check that your profile is active.";
  }
  return message;
}
