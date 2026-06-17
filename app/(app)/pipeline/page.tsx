import { PipelineSurface } from "@/components/pipeline/pipeline-surface";
import { QuoteFilters } from "@/components/quotes/quote-filters";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { canExportData, contactRevealMode } from "@/lib/auth/roles";
import { applyQuoteFilters, type QuoteFilterParams } from "@/lib/quotes/filters";
import { createClient } from "@/lib/supabase/server";

type PipelineContact = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
};

type PipelineEmailEvent = {
  id: string;
  quote_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

type PipelineSourceLead = {
  id: string;
  lead_code: string | null;
  status: string | null;
  assigned_to: string | null;
  assigned_profile: { full_name: string | null } | null;
};

type PipelineQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  currency_code: string;
  total_amount: number;
  sent_date: string | null;
  last_opened: string | null;
  open_count: number;
  pipeline_category: string;
  followup_date: string | null;
  pipeline_comment: string | null;
  tags: string[] | null;
  folder_id: string | null;
  clients: {
    name: string;
    code: string | null;
    group_id: string | null;
    contact_details: PipelineContact | null;
  } | null;
  source_lead: PipelineSourceLead | null;
  service_requested: string[];
  email_events: PipelineEmailEvent[];
};

type PipelineLoadResult = {
  quotes: PipelineQuote[];
  categories: string[];
  warning: string | null;
};

type FolderRow = {
  id: string;
  name: string;
};

type TagCategoryRow = {
  id: string;
  name: string;
};

type TagRow = {
  id: string;
  name: string;
  category_id: string | null;
};

export default async function PipelinePage({
  searchParams
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; status?: string; tag?: string; category?: string; folder?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const profile = await requireProfile();
  const { quotes, categories, warning } = await loadPipelineQuotes(supabase, params);

  const [
    { data: foldersData, error: foldersError },
    { data: tagCategoryData, error: tagCategoriesError },
    { data: tagData, error: tagsError }
  ] = await Promise.all([
    supabase.from("quote_folders").select("id,name").eq("active", true).order("name"),
    supabase.from("pipeline_tag_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("pipeline_tags").select("id,name,category_id").eq("active", true).order("sort_order").order("name")
  ]);

  const folders = (foldersData ?? []) as FolderRow[];
  const tagCategories = new Map(((tagCategoryData ?? []) as TagCategoryRow[]).map((category) => [category.id, category.name]));
  const tags = ((tagData ?? []) as TagRow[]).map((tag) => ({
    ...tag,
    category_name: tag.category_id ? tagCategories.get(tag.category_id) ?? "General" : "General"
  }));
  const sortedQuotes = sortQuotes(quotes, params.sort ?? "recent");
  const notices = [warning, foldersError ? friendlyPipelineError(foldersError.message) : null, tagCategoriesError ? friendlyPipelineError(tagCategoriesError.message) : null, tagsError ? friendlyPipelineError(tagsError.message) : null].filter(Boolean) as string[];
  const revealMode = contactRevealMode(profile.role);
  const exportQuery = buildPipelineExportQuery(params);
  const canExport = canExportData(profile.role);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Pipeline</p>
          <h1 className="mt-1 text-3xl font-black text-black">Working pipeline</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Board view groups by stage so you can scan a column and see where leads are stuck. Drag a card across
            stages to update status. Follow-up chips turn red when overdue and amber on the day — click any chip to
            snooze.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="black">{sortedQuotes.length} leads</StatusPill>
          {canExport ? (
            <a
              href={exportQuery ? `/api/pipeline/export?${exportQuery}` : "/api/pipeline/export"}
              className="rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-black text-black"
            >
              Export pipeline CSV
            </a>
          ) : (
            <span className="text-xs font-semibold text-neutral-500">Export is Admin only</span>
          )}
          <a href="/pipeline-setup" className="rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-black text-black">
            Manage folders and tags
          </a>
        </div>
      </header>

      {notices.map((notice, index) => (
        <Notice key={`${notice}-${index}`} tone="red">
          {notice}
        </Notice>
      ))}

      <QuoteFilters action="/pipeline" params={params} categories={categories} folders={folders} tags={tags} showSort />

      <PipelineSurface
        initialQuotes={sortedQuotes}
        folders={folders}
        tags={tags}
        categories={categories}
        showFullContact={revealMode !== "masked_until_reveal"}
        currentUser={{ id: profile.id, full_name: profile.full_name, email: profile.email }}
        canManagePipelineTaxonomy={profile.role === "admin" || profile.role === "manager"}
      />
    </div>
  );
}

// Cap the initial pipeline pull. 1000 rows + a nested email-events join was
// the slowest path in the app — for a CA firm 250 recent quotes covers the
// active working set, and anything older can be reached by filtering.
const PIPELINE_QUOTE_LIMIT = 250;

async function loadPipelineQuotes(supabase: Awaited<ReturnType<typeof createClient>>, params: QuoteFilterParams): Promise<PipelineLoadResult> {
  let query = supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,status,currency_code,total_amount,sent_date,last_opened,open_count,pipeline_category,followup_date,pipeline_comment,tags,folder_id,clients(name,code,group_id,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number)),source_lead:leads!quotes_source_lead_id_fkey(id,lead_code,status,assigned_to,assigned_profile:profiles!leads_assigned_to_fkey(full_name)),quotes_services(services(name))"
    )
    .order("created_at", { ascending: false })
    .limit(PIPELINE_QUOTE_LIMIT);

  if (!params.status) query = query.neq("status", "draft");
  query = applyQuoteFilters(query, params);

  const { data, error } = await query;
  if (!error) {
    const quotes = ((data ?? []) as unknown as Array<
      Omit<PipelineQuote, "clients" | "source_lead" | "service_requested" | "email_events"> & {
        clients: unknown;
        source_lead?: unknown;
        quotes_services?: unknown;
      }
    >).map((quote) => ({
      ...quote,
      clients: normalizePipelineClient(quote.clients),
      source_lead: normalizePipelineSourceLead(quote.source_lead),
      service_requested: normalizeServiceNames(quote.quotes_services),
      email_events: []
    }));
    const emailEventsByQuote = await loadLatestEmailEvents(supabase, quotes.map((quote) => quote.id));
    const quotesWithEmailEvents = quotes.map((quote) => ({
      ...quote,
      email_events: emailEventsByQuote.get(quote.id) ?? []
    }));

    return {
      quotes: quotesWithEmailEvents,
      categories: collectCategories(quotesWithEmailEvents),
      warning: null
    };
  }

  if (!shouldFallbackToLegacyPipeline(error.message)) {
    return { quotes: [], categories: ["General"], warning: friendlyPipelineError(error.message) };
  }

  let fallbackQuery = supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,status,currency_code,total_amount,sent_date,last_opened,open_count,tags,clients(name,code,group_id,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number)),quotes_services(services(name))"
    )
    .order("created_at", { ascending: false })
    .limit(PIPELINE_QUOTE_LIMIT);

  if (!params.status) fallbackQuery = fallbackQuery.neq("status", "draft");
  fallbackQuery = applyQuoteFilters(fallbackQuery, { ...params, category: undefined, folder: undefined });

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) {
    return { quotes: [], categories: ["General"], warning: friendlyPipelineError(fallbackError.message) };
  }

  const quotes = ((fallbackData ?? []) as unknown as Array<
    Omit<PipelineQuote, "pipeline_category" | "followup_date" | "pipeline_comment" | "folder_id" | "clients" | "source_lead" | "service_requested" | "email_events"> & {
      clients: unknown;
      quotes_services?: unknown;
    }
  >).map((quote) => ({
    ...quote,
    clients: normalizePipelineClient(quote.clients),
    service_requested: normalizeServiceNames(quote.quotes_services),
    pipeline_category: "General",
    followup_date: null,
    pipeline_comment: "",
    folder_id: null,
    source_lead: null,
    email_events: []
  }));
  const emailEventsByQuote = await loadLatestEmailEvents(supabase, quotes.map((quote) => quote.id));
  const quotesWithEmailEvents = quotes.map((quote) => ({
    ...quote,
    email_events: emailEventsByQuote.get(quote.id) ?? []
  }));

  return {
    quotes: quotesWithEmailEvents,
    categories: ["General"],
    warning: "Pipeline is running in compatibility mode. Run migrations 0005 and 0006 in Supabase SQL Editor to enable folders, follow-up dates, comments, and compact tag controls."
  };
}

// Cap how much email-event history we pull for the pipeline view.
// We only show the latest event per row collapsed and up to 5 when expanded —
// no need to drag the full multi-year audit trail across the wire.
const PIPELINE_EMAIL_EVENT_LIMIT = 1500;
const PIPELINE_EMAIL_EVENT_LOOKBACK_DAYS = 120;
const PIPELINE_EMAIL_EVENTS_PER_QUOTE = 5;

async function loadLatestEmailEvents(supabase: Awaited<ReturnType<typeof createClient>>, quoteIds: string[]) {
  if (!quoteIds.length) return new Map<string, PipelineEmailEvent[]>();

  const sinceIso = new Date(Date.now() - PIPELINE_EMAIL_EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("email_events")
    .select("id,quote_id,recipient_email,subject,status,sent_at,opened_at,clicked_at,failed_at,failure_reason,created_at")
    .in("quote_id", quoteIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(PIPELINE_EMAIL_EVENT_LIMIT);

  return ((data ?? []) as Array<PipelineEmailEvent & { created_at?: string | null }>).reduce<Map<string, PipelineEmailEvent[]>>((groups, event) => {
    if (!event.quote_id) return groups;
    const existing = groups.get(event.quote_id) ?? [];
    if (existing.length >= PIPELINE_EMAIL_EVENTS_PER_QUOTE) return groups;
    groups.set(event.quote_id, [...existing, event]);
    return groups;
  }, new Map<string, PipelineEmailEvent[]>());
}

function collectCategories(quotes: PipelineQuote[]) {
  const items = new Set<string>(["General"]);
  quotes.forEach((quote) => {
    if (quote.pipeline_category?.trim()) items.add(quote.pipeline_category.trim());
  });
  return [...items].sort();
}

function sortQuotes(quotes: PipelineQuote[], sort: string) {
  const items = [...quotes];
  const safeDate = (value: string | null) => (value ? new Date(value).getTime() : 0);

  return items.sort((a, b) => {
    if (sort === "followup_asc") return safeDate(a.followup_date) - safeDate(b.followup_date) || safeDate(b.sent_date) - safeDate(a.sent_date);
    if (sort === "followup_desc") return safeDate(b.followup_date) - safeDate(a.followup_date) || safeDate(b.sent_date) - safeDate(a.sent_date);
    if (sort === "amount_desc") return b.total_amount - a.total_amount;
    if (sort === "amount_asc") return a.total_amount - b.total_amount;
    if (sort === "opens_desc") return b.open_count - a.open_count || safeDate(b.last_opened) - safeDate(a.last_opened);
    if (sort === "client_asc") return (a.clients?.name ?? "").localeCompare(b.clients?.name ?? "");
    return safeDate(b.sent_date) - safeDate(a.sent_date);
  });
}

function normalizePipelineClient(value: unknown): PipelineQuote["clients"] {
  if (!value) return null;

  if (Array.isArray(value)) {
    const first = value[0];
    if (!first || typeof first !== "object") return null;
    return {
      name: String(first.name ?? ""),
      code: asNullableString(first.code),
      group_id: asNullableString(first.group_id),
      contact_details: normalizePipelineContact((first as { contact_details?: unknown }).contact_details)
    };
  }

  if (typeof value === "object" && value) {
    const record = value as {
      name?: unknown;
      code?: unknown;
      group_id?: unknown;
      contact_details?: unknown;
    };

    return {
      name: String(record.name ?? ""),
      code: asNullableString(record.code),
      group_id: asNullableString(record.group_id),
      contact_details: normalizePipelineContact(record.contact_details)
    };
  }

  return null;
}

function normalizePipelineSourceLead(value: unknown): PipelineQuote["source_lead"] {
  if (!value) return null;
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;

  const assignedProfileRaw = (record as { assigned_profile?: unknown }).assigned_profile;
  const assignedProfile = Array.isArray(assignedProfileRaw) ? assignedProfileRaw[0] : assignedProfileRaw;

  return {
    id: String((record as { id?: unknown }).id ?? ""),
    lead_code: asNullableString((record as { lead_code?: unknown }).lead_code),
    status: asNullableString((record as { status?: unknown }).status),
    assigned_to: asNullableString((record as { assigned_to?: unknown }).assigned_to),
    assigned_profile:
      assignedProfile && typeof assignedProfile === "object"
        ? {
            full_name: asNullableString((assignedProfile as { full_name?: unknown }).full_name)
          }
        : null
  };
}

function normalizePipelineContact(value: unknown): PipelineContact | null {
  if (!value) return null;
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  const contact = record as Record<string, unknown>;
  return {
    primary_email: asNullableString(contact.primary_email),
    secondary_email: asNullableString(contact.secondary_email),
    primary_mobile: asNullableString(contact.primary_mobile),
    secondary_mobile: asNullableString(contact.secondary_mobile),
    whatsapp_number: asNullableString(contact.whatsapp_number)
  };
}

function normalizeServiceNames(value: unknown) {
  if (!Array.isArray(value)) return [];

  const names = value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const services = (entry as { services?: unknown }).services;
      if (Array.isArray(services)) return services;
      return services ? [services] : [];
    })
    .map((service) => {
      if (!service || typeof service !== "object") return null;
      return asNullableString((service as { name?: unknown }).name);
    })
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

function asNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function shouldFallbackToLegacyPipeline(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("pipeline_category") ||
    lower.includes("followup_date") ||
    lower.includes("pipeline_comment") ||
    lower.includes("folder_id") ||
    lower.includes("source_lead_id") ||
    lower.includes("quotes_source_lead_id") ||
    lower.includes("quote_folders") ||
    lower.includes("schema cache") ||
    lower.includes("column")
  );
}

function friendlyPipelineError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("quote_folders") || lower.includes("pipeline_tags") || lower.includes("pipeline_tag_categories")) {
    return "Pipeline folders and defined tags are missing. Run migration 0006 in Supabase SQL Editor, then refresh this page.";
  }
  if (shouldFallbackToLegacyPipeline(lower) || lower.includes("relation")) {
    return "Pipeline fields are missing. Run migrations 0005 and 0006 in Supabase SQL Editor, then refresh this page.";
  }
  return message;
}

function buildPipelineExportQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    query.set(key, value);
  }
  return query.toString();
}
