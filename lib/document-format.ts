export type StructuredDocumentKind = "item" | "heading" | "break";

export type StructuredDocumentLine = {
  kind: StructuredDocumentKind;
  label: string;
};

export function parseStructuredDocumentText(value: string) {
  const lines = value.split(/\r?\n/);
  const items: StructuredDocumentLine[] = [];

  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      items.push({ kind: "break", label: "" });
      return;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      items.push({ kind: "heading", label: heading });
      return;
    }

    splitLineIntoItems(trimmed).forEach((label) => {
      items.push({ kind: "item", label });
    });
  });

  return collapseBreaks(items);
}

export function serializeStructuredDocumentLines(lines: StructuredDocumentLine[]) {
  return lines
    .map((line) => {
      if (line.kind === "break") return "";
      if (line.kind === "heading") return `# ${line.label}`;
      return line.label;
    })
    .join("\n");
}

export function getDocumentBulletLabels(lines: StructuredDocumentLine[]) {
  return lines.filter((line) => line.kind === "item").map((line) => renderStructuredDocumentInlineText(line.label));
}

export function renderStructuredDocumentInlineHtml(value: string) {
  return escapeHtml(String(value ?? ""))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
}

export function renderStructuredDocumentInlineText(value: string) {
  return String(value ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1$2");
}

function parseHeading(value: string) {
  if (/^#{1,3}(?:\s+|(?=\S))/.test(value)) {
    const heading = value
      .replace(/^#{1,3}\s*/, "")
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .trim();
    return heading;
  }

  if (/^\*\*.+\*\*$/.test(value)) {
    return value.replace(/^\*\*|\*\*$/g, "").trim();
  }

  return "";
}

function splitLineIntoItems(value: string) {
  return value
    .split(/,{2,}|\.{2,}|;+/)
    .map((segment) => segment.replace(/^(?:[-*]|\u2022)\s+/, "").trim())
    .filter(Boolean);
}

function collapseBreaks(lines: StructuredDocumentLine[]) {
  const collapsed: StructuredDocumentLine[] = [];

  lines.forEach((line) => {
    if (line.kind === "break") {
      if (!collapsed.length || collapsed[collapsed.length - 1]?.kind === "break") return;
    }
    collapsed.push(line);
  });

  if (collapsed[0]?.kind === "break") collapsed.shift();
  if (collapsed[collapsed.length - 1]?.kind === "break") collapsed.pop();

  return collapsed;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
