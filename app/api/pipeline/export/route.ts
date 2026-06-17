import { NextResponse } from "next/server";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { applyQuoteFilters, type QuoteFilterParams } from "@/lib/quotes/filters";
import { createAdminClient } from "@/lib/supabase/admin";

type ExportContact = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
};

type ExportClient = {
  name: string;
  code: string | null;
  group_id: string | null;
  contact_details: ExportContact | ExportContact[] | null;
};

type ExportServiceRecord = {
  name: string | null;
  category: string | null;
};

type ExportServiceLink = {
  services: ExportServiceRecord | ExportServiceRecord[] | null;
};

type ExportQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  currency_code: string | null;
  total_amount: number;
  sent_date: string | null;
  last_opened: string | null;
  open_count: number;
  followup_date: string | null;
  pipeline_category: string | null;
  tags: string[] | null;
  folder_id: string | null;
  clients: ExportClient | ExportClient[] | null;
  quotes_services: ExportServiceLink[] | null;
};

type CsvRow = Record<string, string>;

const pageSize = 1000;

export async function GET(request: Request) {
  await requireRole(["admin"]);
  const profile = await requireProfile();
  const supabase = createAdminClient();
  const params = readFilterParams(request);

  const [quotes, folderMap] = await Promise.all([loadQuotes(supabase, params), loadFolderMap(supabase)]);
  const rows = quotes.map((quote) => buildCsvRow(quote, folderMap));
  const csv = toCsv(rows);
  const filename = `pipeline-export-${new Date().toISOString().slice(0, 10)}.csv`;

  await supabase.rpc("log_activity", {
    action_type: "pipeline_exported",
    details: {
      by: profile.email,
      filters: params,
      exported_rows: rows.length
    }
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function loadQuotes(supabase: ReturnType<typeof createAdminClient>, params: QuoteFilterParams) {
  const rows: ExportQuote[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("quotes")
      .select(
        "id,quote_id_formatted,status,currency_code,total_amount,sent_date,last_opened,open_count,followup_date,pipeline_category,tags,folder_id,clients(name,code,group_id,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number)),quotes_services(services(name,category))"
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (!params.status) query = query.neq("status", "draft");
    query = applyQuoteFilters(query, params);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batch = ((data ?? []) as unknown) as ExportQuote[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadFolderMap(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase.from("quote_folders").select("id,name");
  return new Map((data ?? []).map((folder) => [String(folder.id), String(folder.name)]));
}

function buildCsvRow(quote: ExportQuote, folderMap: Map<string, string>): CsvRow {
  const client = normalizeClient(quote.clients);
  const contact = normalizeContact(client?.contact_details ?? null);
  const services = normalizeServices(quote.quotes_services);

  return {
    quote_id: stringifyValue(quote.quote_id_formatted),
    client_name: stringifyValue(client?.name),
    client_code: stringifyValue(client?.code),
    group_id: stringifyValue(client?.group_id),
    service_name: services.names.join(", "),
    service_type: services.categories.join(", "),
    status: stringifyValue(quote.status),
    folder: quote.folder_id ? stringifyValue(folderMap.get(quote.folder_id)) : "",
    category: stringifyValue(quote.pipeline_category),
    email: stringifyValue(contact.primary_email),
    secondary_email: stringifyValue(contact.secondary_email),
    mobile: stringifyValue(contact.primary_mobile),
    secondary_mobile: stringifyValue(contact.secondary_mobile),
    whatsapp: stringifyValue(contact.whatsapp_number),
    sent_date: stringifyValue(quote.sent_date),
    followup_date: stringifyValue(quote.followup_date),
    total_amount: quote.total_amount === null || quote.total_amount === undefined ? "" : String(quote.total_amount),
    currency_code: stringifyValue(quote.currency_code),
    open_count: quote.open_count === null || quote.open_count === undefined ? "0" : String(quote.open_count),
    last_opened: stringifyValue(quote.last_opened),
    tags: Array.isArray(quote.tags) ? quote.tags.join(", ") : ""
  };
}

function normalizeClient(value: ExportQuote["clients"]) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeContact(value: ExportClient["contact_details"]) {
  if (!value) return {} as ExportContact;
  if (Array.isArray(value)) return (value[0] ?? {}) as ExportContact;
  return value;
}

function normalizeServices(value: ExportQuote["quotes_services"]) {
  const names = new Set<string>();
  const categories = new Set<string>();

  for (const link of value ?? []) {
    const service = Array.isArray(link.services) ? link.services[0] : link.services;
    const name = stringifyValue(service?.name);
    const category = stringifyValue(service?.category);
    if (name) names.add(name);
    if (category) categories.add(category);
  }

  return {
    names: [...names],
    categories: [...categories]
  };
}

function readFilterParams(request: Request): QuoteFilterParams {
  const searchParams = new URL(request.url).searchParams;
  return {
    period: searchParams.get("period") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    folder: searchParams.get("folder") ?? undefined,
    sort: searchParams.get("sort") ?? undefined
  };
}

function toCsv(rows: CsvRow[]) {
  const headers = [
    "quote_id",
    "client_name",
    "client_code",
    "group_id",
    "service_name",
    "service_type",
    "status",
    "folder",
    "category",
    "email",
    "secondary_email",
    "mobile",
    "secondary_mobile",
    "whatsapp",
    "sent_date",
    "followup_date",
    "total_amount",
    "currency_code",
    "open_count",
    "last_opened",
    "tags"
  ];

  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))].join("\n");
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvCell(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

