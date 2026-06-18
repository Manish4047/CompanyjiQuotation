const CRM_WEBHOOK_URL = "https://YOUR_DOMAIN/api/leads/intake";
const CRM_SECRET = "YOUR_LEAD_INTAKE_SECRET";
const SHEET_NAME = "Leads";
const HEADER_ROW = 1;
const PUSHED_AT_HEADER = "crm_pushed_at";
const LEAD_ID_HEADER = "crm_lead_id";
const MODE = "create_once";

function installLeadSheetTrigger() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger("onLeadSheetEdit").forSpreadsheet(spreadsheet).onEdit().create();
}

function onLeadSheetEdit(event) {
  const range = event && event.range ? event.range : null;
  if (!range) return;

  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const rowNumber = range.getRow();
  if (rowNumber <= HEADER_ROW) return;

  pushLeadRowToCrm_(sheet, rowNumber, false);
}

function pushAllUnsentRows() {
  const sheet = getLeadSheet_();
  const lastRow = sheet.getLastRow();

  for (let rowNumber = HEADER_ROW + 1; rowNumber <= lastRow; rowNumber += 1) {
    pushLeadRowToCrm_(sheet, rowNumber, false);
  }
}

function repushSelectedRow() {
  const sheet = getLeadSheet_();
  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber <= HEADER_ROW) {
    throw new Error("Select a lead row first.");
  }

  pushLeadRowToCrm_(sheet, rowNumber, true);
}

function pushLeadRowToCrm_(sheet, rowNumber, forcePush) {
  const headerMap = getHeaderMap_(sheet);
  const pushedAtColumn = ensureHeaderColumn_(sheet, headerMap, PUSHED_AT_HEADER);
  const leadIdColumn = ensureHeaderColumn_(sheet, headerMap, LEAD_ID_HEADER);
  const rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const payload = mapRowToPayload_(sheet, rowNumber, headerMap, rowValues, forcePush);

  if (!payload) return;
  if (!forcePush && MODE === "create_once" && rowValues[pushedAtColumn - 1]) return;

  const response = UrlFetchApp.fetch(CRM_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${CRM_SECRET}`
    },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });

  const bodyText = response.getContentText();
  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(`CRM rejected row ${rowNumber}: ${status} ${bodyText}`);
  }

  const body = bodyText ? JSON.parse(bodyText) : {};
  sheet.getRange(rowNumber, pushedAtColumn).setValue(new Date());
  if (body && body.leadId) {
    sheet.getRange(rowNumber, leadIdColumn).setValue(body.leadId);
  }
}

function mapRowToPayload_(sheet, rowNumber, headerMap, rowValues, forcePush) {
  const getValue = (headerNames) => {
    for (const headerName of headerNames) {
      const column = headerMap[normalizeHeader_(headerName)];
      if (!column) continue;
      const value = String(rowValues[column - 1] || "").trim();
      if (value) return value;
    }
    return "";
  };

  const companyName = getValue(["company_name", "company name", "business_name", "business name", "company"]);
  const contactName = getValue(["contact_name", "contact name", "full_name", "full name", "name"]);
  const directorName = getValue(["director_name", "director name", "owner_name", "owner name"]);
  const phone = getValue(["phone", "phone_number", "phone number", "mobile", "mobile_number", "mobile number"]);
  const whatsappNumber = getValue(["whatsapp_number", "whatsapp number", "whatsapp", "wa_number"]);
  const email = getValue(["email", "email_address", "email address"]);
  const remarks = getValue(["remarks", "notes", "comment", "requirement"]);
  const tags = getValue(["tags"]);
  const source = getValue(["source"]) || "website_form";

  if (!companyName && !contactName && !phone && !email) return null;

  const externalIdBase = `${sheet.getParent().getId()}:${sheet.getSheetId()}:${rowNumber}`;

  return {
    source,
    form_name: sheet.getName(),
    external_id: forcePush ? `${externalIdBase}:${Date.now()}` : externalIdBase,
    company_name: companyName || contactName || directorName || `Sheet lead ${rowNumber}`,
    contact_name: contactName,
    director_name: directorName,
    phone,
    whatsapp_number: whatsappNumber || phone,
    email,
    remarks,
    tags,
    source_label: "Google Sheet"
  };
}

function getLeadSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" was not found.`);
  }
  return sheet;
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};

  headers.forEach((headerValue, index) => {
    const normalized = normalizeHeader_(headerValue);
    if (!normalized) return;
    map[normalized] = index + 1;
  });

  return map;
}

function ensureHeaderColumn_(sheet, headerMap, headerName) {
  const normalized = normalizeHeader_(headerName);
  if (headerMap[normalized]) return headerMap[normalized];

  const column = sheet.getLastColumn() + 1;
  sheet.getRange(HEADER_ROW, column).setValue(headerName);
  headerMap[normalized] = column;
  return column;
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
