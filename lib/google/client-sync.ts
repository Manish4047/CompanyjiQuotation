import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGoogleSheetRows, type SheetRow } from "@/lib/google/sheets";

type SyncResult = {
  created: number;
  updated: number;
  skipped: number;
};

export async function syncClientsFromGoogleSheet(): Promise<SyncResult> {
  const sheetId = process.env.GOOGLE_SHEETS_CLIENT_LIST_ID;
  const range = process.env.GOOGLE_SHEETS_CLIENT_LIST_RANGE || "Clients!A:Z";

  if (!sheetId) throw new Error("GOOGLE_SHEETS_CLIENT_LIST_ID is not set.");

  const rows = await fetchGoogleSheetRows(sheetId, range);
  const supabase = createAdminClient();
  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const mapped = mapSheetRow(row);
    if (!mapped.name) {
      result.skipped += 1;
      continue;
    }

    const externalId = mapped.externalId || stableExternalId(mapped);
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("external_source", "google_sheet_client_list")
      .eq("external_id", externalId)
      .maybeSingle();

    const payload = {
      code: mapped.code || undefined,
      group_id: mapped.groupId || null,
      name: mapped.name,
      client_type: mapped.clientType || null,
      source: mapped.source || "Google Sheet",
      status: "dormant",
      acquired_date: mapped.acquiredDate || null,
      notes: mapped.notes || null,
      external_source: "google_sheet_client_list",
      external_id: externalId,
      last_synced_at: new Date().toISOString()
    };

    if (existing?.id) {
      const { error } = await supabase.from("clients").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      result.updated += 1;
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) throw new Error(error.message);
      result.created += 1;
    }
  }

  return result;
}

function mapSheetRow(row: SheetRow) {
  const code = pick(row, ["client_id", "client_code", "code", "id"]);
  const groupId = pick(row, ["group_id", "group", "group_code"]);
  const name = pick(row, ["client_name", "name", "party_name", "customer_name", "owner_name"]) || pick(row, ["company_name"]);

  return {
    code,
    groupId,
    name,
    externalId: code || pick(row, ["sheet_id", "record_id"]),
    clientType: pick(row, ["client_type", "type"]),
    source: pick(row, ["source"]),
    acquiredDate: normalizeDate(pick(row, ["acquired_date", "date", "created_date"])),
    notes: pick(row, ["notes", "remarks"]),
    companyName: pick(row, ["company_name"])
  };
}

function pick(row: SheetRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return "";
}

function stableExternalId(mapped: ReturnType<typeof mapSheetRow>) {
  return crypto
    .createHash("sha256")
    .update([mapped.name, mapped.groupId, mapped.companyName].join("|").toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

function normalizeDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
