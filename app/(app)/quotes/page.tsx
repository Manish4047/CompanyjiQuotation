import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteFilters } from "@/components/quotes/quote-filters";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { createClient } from "@/lib/supabase/server";
import { applyQuoteFilters, type QuoteFilterParams } from "@/lib/quotes/filters";
import { formatCurrency, formatDate, quoteStatusTone } from "@/lib/utils";

type QuoteRow = {
  id: string;
  quote_id_formatted: string;
  status: string;
  plan_chosen: string;
  pipeline_category: string;
  currency_code: string;
  total_amount: number;
  prepaid_total_amount: number;
  postpaid_total_amount: number;
  include_prepaid_plan: boolean;
  include_postpaid_plan: boolean;
  recommended_plan: string;
  validity_date: string;
  created_at: string;
  tags: string[] | null;
  clients: { name: string; code: string | null; group_id: string | null } | null;
};

type QuotesLoadResult = {
  quotes: QuoteRow[];
  categories: string[];
  warning: string | null;
};

export default async function QuotesPage({
  searchParams
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; status?: string; tag?: string; category?: string; folder?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { quotes, categories, warning } = await loadQuotes(supabase, params);
  const [
    { data: foldersData },
    { data: tagCategoryData },
    { data: tagData }
  ] = await Promise.all([
    supabase.from("quote_folders").select("id,name").eq("active", true).order("name"),
    supabase.from("pipeline_tag_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("pipeline_tags").select("id,name,category_id").eq("active", true).order("sort_order").order("name")
  ]);
  const tagCategories = new Map(((tagCategoryData ?? []) as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
  const tags = ((tagData ?? []) as Array<{ id: string; name: string; category_id: string | null }>).map((tag) => ({
    ...tag,
    category_name: tag.category_id ? tagCategories.get(tag.category_id) ?? "General" : "General"
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Quotation register</p>
          <h1 className="mt-1 text-3xl font-black text-black">All quotes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            A simple list view for every quote, separate from the pipeline.
          </p>
        </div>
        <Link href="/quotes/new">
          <Button>New quote</Button>
        </Link>
      </header>

      {warning ? <Notice tone="red">{warning}</Notice> : null}

      <QuoteFilters action="/quotes" params={params} categories={categories} folders={(foldersData ?? []) as Array<{ id: string; name: string }>} tags={tags} />

      <Card>
        <CardHeader>
          <CardTitle>{quotes.length} quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/quotes/${quote.id}`}
              className="block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 transition hover:border-[#a0ce4e]"
            >
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black">{quote.quote_id_formatted}</h2>
                    <StatusPill tone={quoteStatusTone(quote.status)}>{quote.status.replaceAll("_", " ")}</StatusPill>
                    <StatusPill>{quote.pipeline_category}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {quote.clients?.name ?? "Client"} | {quote.clients?.code ?? "No client code"} | Group {quote.clients?.group_id || "not set"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(quote.tags ?? []).map((tag) => (
                      <StatusPill key={tag}>{tag}</StatusPill>
                    ))}
                  </div>
                </div>
                <div className="text-sm lg:text-right">
                  {quote.include_prepaid_plan ? <p className="font-black">Prepaid {formatCurrency(quote.prepaid_total_amount, quote.currency_code)}</p> : null}
                  {quote.include_postpaid_plan ? <p className="mt-1 font-black">Postpaid {formatCurrency(quote.postpaid_total_amount, quote.currency_code)}</p> : null}
                  <p className="mt-1 text-neutral-500">Recommended: {quote.recommended_plan}</p>
                  <p className="mt-1 text-neutral-500">Valid until {formatDate(quote.validity_date)}</p>
                </div>
              </div>
            </Link>
          ))}
          {!quotes.length ? (
            <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
              No quotes match these filters.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

async function loadQuotes(supabase: Awaited<ReturnType<typeof createClient>>, params: QuoteFilterParams): Promise<QuotesLoadResult> {
  let query = supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,status,plan_chosen,pipeline_category,currency_code,total_amount,prepaid_total_amount,postpaid_total_amount,include_prepaid_plan,include_postpaid_plan,recommended_plan,validity_date,created_at,tags,clients(name,code,group_id)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  query = applyQuoteFilters(query, params);

  const { data, error } = await query;
  if (!error) {
    const quotes = ((data ?? []) as unknown as Array<Omit<QuoteRow, "clients"> & { clients: unknown }>).map((quote) => ({
      ...quote,
      clients: normalizeQuoteClient(quote.clients)
    }));
    return {
      quotes,
      categories: [...new Set(quotes.map((quote) => quote.pipeline_category).filter(Boolean))].sort(),
      warning: null
    };
  }

  if (!shouldFallbackToLegacyQuotes(error.message)) {
    return { quotes: [], categories: [], warning: friendlyQuotesError(error.message) };
  }

  let fallbackQuery = supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,status,plan_chosen,currency_code,total_amount,prepaid_total_amount,postpaid_total_amount,include_prepaid_plan,include_postpaid_plan,recommended_plan,validity_date,created_at,tags,clients(name,code,group_id)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  fallbackQuery = applyQuoteFilters(fallbackQuery, { ...params, category: undefined });

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) {
    return { quotes: [], categories: [], warning: friendlyQuotesError(fallbackError.message) };
  }

  const quotes = ((fallbackData ?? []) as unknown as Array<Omit<QuoteRow, "pipeline_category" | "clients"> & { clients: unknown }>).map((quote) => ({
    ...quote,
    clients: normalizeQuoteClient(quote.clients),
    pipeline_category: "General"
  }));

  return {
    quotes,
    categories: ["General"],
    warning: "Quote category fields are missing in Supabase. Run migration 0005 in Supabase SQL Editor to enable pipeline categories and campaign filters."
  };
}

function shouldFallbackToLegacyQuotes(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("pipeline_category") || lower.includes("schema cache") || lower.includes("column");
}

function friendlyQuotesError(message: string) {
  const lower = message.toLowerCase();
  if (shouldFallbackToLegacyQuotes(lower) || lower.includes("relation")) {
    return "Quote category fields are missing in Supabase. Run migration 0005 in Supabase SQL Editor, then refresh this page.";
  }
  return message;
}

function normalizeQuoteClient(value: unknown): { name: string; code: string | null; group_id: string | null } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return normalizeQuoteClient(first);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as { name?: unknown; code?: unknown; group_id?: unknown };
    return {
      name: String(record.name ?? ""),
      code: record.code == null ? null : String(record.code),
      group_id: record.group_id == null ? null : String(record.group_id)
    };
  }
  return null;
}
