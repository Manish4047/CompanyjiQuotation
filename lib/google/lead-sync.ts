import "server-only";

import crypto from "node:crypto";
import { ingestLeadSubmission, type NormalizedLeadIngest } from "@/lib/lead-ingest";
import { fetchGoogleSheetRows, type SheetRow } from "@/lib/google/sheets";

export type GoogleLeadSyncResult = {
  created: number;
  duplicate: number;
  failed: number;
  processed: number;
  skipped: number;
  tabs: Array<{
    created: number;
    duplicate: number;
    failed: number;
    processed: number;
    sheet: string;
    skipped: number;
  }>;
};

const defaultLeadRanges = ["Cold Calling Leads!A:O", "Whatsapp Leads CCFS!A:R", "META leads!A:L"];

export async function syncLeadsFromGoogleSheet(): Promise<GoogleLeadSyncResult> {
  const sheetId = process.env.GOOGLE_SHEETS_LEAD_TRACKER_ID;
  if (!sheetId) {
    throw new Error("GOOGLE_SHEETS_LEAD_TRACKER_ID is not set.");
  }

  const ranges = getConfiguredLeadRanges();
  const result: GoogleLeadSyncResult = {
    created: 0,
    duplicate: 0,
    failed: 0,
    processed: 0,
    skipped: 0,
    tabs: []
  };

  for (const range of ranges) {
    const rows = await fetchGoogleSheetRows(sheetId, range);
    const sheetName = range.split("!")[0] || range;
    const tabSummary = {
      created: 0,
      duplicate: 0,
      failed: 0,
      processed: 0,
      sheet: sheetName,
      skipped: 0
    };

    for (const [index, row] of rows.entries()) {
      const normalized = mapLeadTrackerRow(sheetName, row, index + 2, sheetId);
      if (!normalized) {
        tabSummary.skipped += 1;
        result.skipped += 1;
        continue;
      }

      try {
        const ingestResult = await ingestLeadSubmission(normalized);
        tabSummary.processed += 1;
        result.processed += 1;

        if (ingestResult.created) {
          tabSummary.created += 1;
          result.created += 1;
        } else if (ingestResult.duplicate) {
          tabSummary.duplicate += 1;
          result.duplicate += 1;
        }
      } catch {
        tabSummary.failed += 1;
        result.failed += 1;
      }
    }

    result.tabs.push(tabSummary);
  }

  return result;
}

export function mapLeadTrackerRow(
  sheetName: string,
  row: SheetRow,
  rowNumber: number,
  spreadsheetId: string
): NormalizedLeadIngest | null {
  const companyName = pick(row, ["company_name"]);
  const directorName = pick(row, ["director_name"]);
  const cin = pick(row, ["cin"]);
  const phone = pick(row, ["number"]);
  const email = pick(row, ["email", "email_address"]);
  const contactName = directorName;

  if (!companyName && !directorName && !phone && !email) {
    return null;
  }

  const quality = parseQuality(pick(row, ["lead_quality_on_5"]));
  const followUpAt = parseLeadTrackerDate(pick(row, ["1st_followup_date", "followup_date", "followup"]));
  const sourceMeta = deriveLeadSource(sheetName);
  const remarks = buildLeadRemarks(row, sheetName);
  const tags = buildLeadTags(sheetName, row);
  const status = mapLeadTrackerStatus(row, followUpAt);
  const identity = [
    sheetName,
    companyName,
    directorName,
    cin,
    phone,
    email,
    pick(row, ["timestamp", "a", "quickiraya"]),
    String(rowNumber)
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|");

  return {
    source: "google_sheet",
    payload: {
      row,
      row_number: rowNumber,
      sheet_name: sheetName
    },
    cin: cin || null,
    companyName: companyName || directorName || phone || email || `Google Sheet lead ${rowNumber}`,
    contactName: contactName || null,
    directorName: directorName || null,
    email: email || null,
    phone: phone || null,
    whatsappNumber: phone || null,
    remarks: remarks || null,
    tags,
    quality,
    status,
    nextFollowUpAt: followUpAt,
    nextFollowUpNote: followUpAt ? `Imported follow-up from ${sheetName}` : null,
    externalId: `gsheet:${createHash(identity)}`,
    formName: sheetName,
    sourceCreatedAt: parseLeadTrackerDate(pick(row, ["timestamp"])),
    normalizedPayload: {
      email_address: pick(row, ["email_address"]) || null,
      row_number: rowNumber,
      sheet_name: sheetName,
      stage: pick(row, ["stage"]) || null,
      status: pick(row, ["status"]) || null
    },
    leadSource: sourceMeta.leadSource,
    intakeLabel: "Google Sheet"
  };
}

export function parseLeadTrackerDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ");
  const match = normalized.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?)?$/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);
    let hours = match[4] ? Number(match[4]) : 9;
    const minutes = match[5] ? Number(match[5]) : 0;
    const meridiem = match[6] ? match[6].toUpperCase() : "";

    if (year < 100) year += 2000;
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;

    const parsed = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const native = new Date(normalized);
  if (!Number.isNaN(native.getTime())) {
    return native.toISOString();
  }

  return null;
}

function getConfiguredLeadRanges() {
  const configured = String(process.env.GOOGLE_SHEETS_LEAD_TRACKER_RANGES ?? "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? configured : defaultLeadRanges;
}

function deriveLeadSource(sheetName: string) {
  const normalized = sheetName.trim().toLowerCase();
  if (normalized.includes("whatsapp")) {
    return { leadSource: "WhatsApp" };
  }
  if (normalized.includes("meta")) {
    return { leadSource: "Meta" };
  }
  return { leadSource: "Cold Call" };
}

function mapLeadTrackerStatus(row: SheetRow, followUpAt: string | null) {
  const values = [
    pick(row, ["lead_status"]),
    pick(row, ["stage"]),
    pick(row, ["status"]),
    pick(row, ["status_2"]),
    pick(row, ["filling_status"]),
    pick(row, ["quotation_send"]),
    pick(row, ["documents_recd"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(values, ["converted", "won", "closed won", "registered", "completed", "done"])) return "converted";
  if (includesAny(values, ["lost", "not interested", "dead", "closed lost"])) return "lost";
  if (includesAny(values, ["quote sent", "quotation sent", "quotation send", "quoted", "proposal sent", "sent"])) return "quotation_sent";
  if (includesAny(values, ["qualified", "hot", "interested"])) return "qualified";
  if (includesAny(values, ["nurture", "warm"])) return "nurture";
  if (followUpAt || includesAny(values, ["follow", "callback", "call back", "working", "reconnect"])) return "follow_up";
  return "new";
}

function buildLeadRemarks(row: SheetRow, sheetName: string) {
  const lines = [
    pick(row, ["remark"]),
    pick(row, ["first_call"]) ? `First call: ${pick(row, ["first_call"])}` : "",
    pick(row, ["filling_status"]) ? `Filing status: ${pick(row, ["filling_status"])}` : "",
    pick(row, ["status"]) ? `Status: ${pick(row, ["status"])}` : "",
    pick(row, ["lead_status"]) ? `Lead status: ${pick(row, ["lead_status"])}` : "",
    pick(row, ["status_2"]) ? `Status 2: ${pick(row, ["status_2"])}` : "",
    pick(row, ["stage"]) ? `Stage: ${pick(row, ["stage"])}` : "",
    pick(row, ["quotation_send"]) ? `Quotation send: ${pick(row, ["quotation_send"])}` : "",
    pick(row, ["documents_recd"]) ? `Documents received: ${pick(row, ["documents_recd"])}` : "",
    pick(row, ["call_done_by"]) ? `Call done by: ${pick(row, ["call_done_by"])}` : "",
    `Imported from Google Sheet tab ${sheetName}.`
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return lines.join("\n");
}

function buildLeadTags(sheetName: string, row: SheetRow) {
  const seen = new Set<string>();
  const tags: string[] = [];

  const add = (value: string | null | undefined) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(normalized);
  };

  add("google-sheet");
  add(sheetName);
  add(pick(row, ["stage"]));
  add(pick(row, ["lead_status"]));
  add(pick(row, ["status"]));
  add(pick(row, ["status_2"]));
  add(pick(row, ["call_done_by"]));
  return tags.slice(0, 10);
}

function parseQuality(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d+)/);
  const numeric = match ? Number(match[1]) : 3;
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function pick(row: SheetRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return "";
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function createHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}
