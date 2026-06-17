import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { loadDynamicListClientRows, loadManualListClientRows, type MarketingListFilters } from "@/lib/marketing-lists";
import { createAdminClient } from "@/lib/supabase/admin";

type CsvRow = Record<string, string>;

type MarketingList = {
  id: string;
  name: string;
  list_type: "manual" | "dynamic";
  filters: {
    tag?: string | null;
    folder_id?: string | null;
    category?: string | null;
    from?: string | null;
    to?: string | null;
    identifiers?: string[];
    service_ids?: string[] | null;
  } | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: listData, error: listError } = await supabase
    .from("marketing_lists")
    .select("id,name,list_type,filters")
    .eq("id", id)
    .single();

  if (listError || !listData) {
    return NextResponse.json({ error: "List not found." }, { status: 404 });
  }

  const list = listData as MarketingList;
  const rows = list.list_type === "manual" ? await loadManualListRows(supabase, list.id) : await loadDynamicListRows(supabase, list);
  const csv = toCsv(rows);
  const filename = `${slugify(list.name)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function loadManualListRows(supabase: ReturnType<typeof createAdminClient>, listId: string) {
  const rows = await loadManualListClientRows(supabase, listId);
  return rows.map(
    (row): CsvRow => ({
      client_name: row.client_name,
      client_code: row.client_code,
      group_id: row.group_id,
      client_status: row.client_status,
      quote_id: row.quote_id,
      quote_status: row.quote_status,
      folder: row.folder,
      category: row.category,
      created_at: row.created_at,
      tags: row.tags.join(", "),
      email: row.email,
      secondary_email: row.secondary_email,
      mobile: row.mobile,
      secondary_mobile: row.secondary_mobile,
      whatsapp: row.whatsapp
    })
  );
}

async function loadDynamicListRows(supabase: ReturnType<typeof createAdminClient>, list: MarketingList) {
  const rows = await loadDynamicListClientRows(supabase, (list.filters ?? {}) as MarketingListFilters);
  return rows.map(
    (row): CsvRow => ({
      client_name: row.client_name,
      client_code: row.client_code,
      group_id: row.group_id,
      client_status: row.client_status,
      quote_id: row.quote_id,
      quote_status: row.quote_status,
      folder: row.folder,
      category: row.category,
      created_at: row.created_at,
      tags: row.tags.join(", "),
      email: row.email,
      secondary_email: row.secondary_email,
      mobile: row.mobile,
      secondary_mobile: row.secondary_mobile,
      whatsapp: row.whatsapp
    })
  );
}

function toCsv(rows: CsvRow[]) {
  const headers = [
    "client_name",
    "client_code",
    "group_id",
    "client_status",
    "quote_id",
    "quote_status",
    "folder",
    "category",
    "created_at",
    "tags",
    "email",
    "secondary_email",
    "mobile",
    "secondary_mobile",
    "whatsapp"
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ];
  return lines.join("\n");
}

function csvCell(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "marketing-list";
}
