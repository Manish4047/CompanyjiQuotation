import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail, normalizeMobile } from "@/lib/contacts";

export type MarketingListFilters = {
  tag?: string | null;
  folder_id?: string | null;
  category?: string | null;
  from?: string | null;
  to?: string | null;
  identifiers?: string[];
  service_ids?: string[] | null;
};

export type DynamicListClientRow = {
  client_id: string;
  client_name: string;
  client_code: string;
  group_id: string;
  client_status: string;
  quote_id: string;
  quote_status: string;
  folder: string;
  category: string;
  created_at: string;
  tags: string[];
  email: string;
  secondary_email: string;
  mobile: string;
  secondary_mobile: string;
  whatsapp: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadDynamicListClientRows(supabase: AdminClient, filters: MarketingListFilters) {
  let query = supabase
    .from("quotes")
    .select(
      "id,client_id,quote_id_formatted,status,pipeline_category,folder_id,created_at,tags,quotes_services(service_id),clients(id,name,code,group_id,status,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number))"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.folder_id) query = query.eq("folder_id", filters.folder_id);
  if (filters.category) query = query.eq("pipeline_category", filters.category);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

  const [{ data: quoteData }, { data: folderData }] = await Promise.all([
    query,
    supabase.from("quote_folders").select("id,name")
  ]);

  const requiredServiceIds = Array.isArray(filters.service_ids) ? filters.service_ids.filter(Boolean) : [];
  const folderNameById = new Map((folderData ?? []).map((folder) => [folder.id, folder.name]));
  const rowsByKey = new Map<string, DynamicListClientRow>();

  for (const quote of quoteData ?? []) {
    const client = normalizeClient(quote.clients);
    if (!client?.id) continue;
    if (requiredServiceIds.length && !hasMatchingService(quote.quotes_services, requiredServiceIds)) continue;

    const contact = normalizeContact(client.contact_details);
    const row: DynamicListClientRow = {
      client_id: stringifyValue(client.id),
      client_name: stringifyValue(client.name),
      client_code: stringifyValue(client.code),
      group_id: stringifyValue(client.group_id),
      client_status: stringifyValue(client.status),
      quote_id: stringifyValue(quote.quote_id_formatted),
      quote_status: stringifyValue(quote.status),
      folder: quote.folder_id ? stringifyValue(folderNameById.get(quote.folder_id)) : "",
      category: stringifyValue(quote.pipeline_category),
      created_at: stringifyValue(quote.created_at),
      tags: Array.isArray(quote.tags) ? quote.tags.map((tag) => stringifyValue(tag)).filter(Boolean) : [],
      email: stringifyValue(contact.primary_email),
      secondary_email: stringifyValue(contact.secondary_email),
      mobile: stringifyValue(contact.primary_mobile),
      secondary_mobile: stringifyValue(contact.secondary_mobile),
      whatsapp: stringifyValue(contact.whatsapp_number)
    };

    const key = buildClientIdentityKey(row);
    if (rowsByKey.has(key)) continue;
    rowsByKey.set(key, row);
  }

  return [...rowsByKey.values()];
}

export async function countDynamicListMembers(supabase: AdminClient, filters: MarketingListFilters) {
  const rows = await loadDynamicListClientRows(supabase, filters);
  return rows.length;
}

export async function loadManualListClientRows(supabase: AdminClient, listId: string) {
  const { data: members } = await supabase.from("marketing_list_members").select("client_id").eq("list_id", listId);
  const clientIds = [...new Set((members ?? []).map((item) => item.client_id))];
  if (!clientIds.length) return [];

  const { data: clientData } = await supabase
    .from("clients")
    .select("id,name,code,group_id,status,tags,contact_details(primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number)")
    .in("id", clientIds)
    .order("name");

  const rows = (clientData ?? []).map(
    (client): DynamicListClientRow => {
      const contact = normalizeContact(client.contact_details);
      return {
        client_id: stringifyValue(client.id),
        client_name: stringifyValue(client.name),
        client_code: stringifyValue(client.code),
        group_id: stringifyValue(client.group_id),
        client_status: stringifyValue(client.status),
        quote_id: "",
        quote_status: "",
        folder: "",
        category: "",
        created_at: "",
        tags: Array.isArray(client.tags) ? client.tags.map((tag) => stringifyValue(tag)).filter(Boolean) : [],
        email: stringifyValue(contact.primary_email),
        secondary_email: stringifyValue(contact.secondary_email),
        mobile: stringifyValue(contact.primary_mobile),
        secondary_mobile: stringifyValue(contact.secondary_mobile),
        whatsapp: stringifyValue(contact.whatsapp_number)
      };
    }
  );

  return dedupeListRowsByContact(rows);
}

export async function countManualListMembers(supabase: AdminClient, listId: string) {
  const rows = await loadManualListClientRows(supabase, listId);
  return rows.length;
}

export function dedupeListRowsByContact(rows: DynamicListClientRow[]) {
  const rowsByKey = new Map<string, DynamicListClientRow>();
  rows.forEach((row) => {
    const key = buildClientIdentityKey(row);
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  });
  return [...rowsByKey.values()];
}

function hasMatchingService(value: unknown, requiredServiceIds: string[]) {
  if (!requiredServiceIds.length) return true;
  if (!Array.isArray(value)) return false;

  const services = value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      return stringifyValue((item as Record<string, unknown>).service_id);
    })
    .filter(Boolean);

  return requiredServiceIds.some((serviceId) => services.includes(serviceId));
}

function normalizeClient(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return normalizeClient(value[0]);
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function normalizeContact(value: unknown) {
  if (!value) return {};
  if (Array.isArray(value)) return normalizeContact(value[0]);
  if (typeof value === "object") return value as Record<string, string | null | undefined>;
  return {};
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildClientIdentityKey(row: Pick<DynamicListClientRow, "client_id" | "email" | "secondary_email" | "mobile" | "secondary_mobile" | "whatsapp">) {
  return (
    normalizeEmail(row.email) ||
    normalizeEmail(row.secondary_email) ||
    normalizeMobile(row.mobile) ||
    normalizeMobile(row.secondary_mobile) ||
    normalizeMobile(row.whatsapp) ||
    row.client_id
  );
}
