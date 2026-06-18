export type RichTextBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered_list"; items: string[] }
  | { type: "ordered_list"; items: string[] };

export function parseRichTextBlocks(value: string | null | undefined): RichTextBlock[] {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks: RichTextBlock[] = [];
  let paragraphLines: string[] = [];
  let listType: "unordered_list" | "ordered_list" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", lines: [...paragraphLines] });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ type: listType, items: [...listItems] });
    listType = null;
    listItems = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^#{1,3}\s*(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: headingMatch[1].trim() });
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "unordered_list") flushList();
      listType = "unordered_list";
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ordered_list") flushList();
      listType = "ordered_list";
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function renderRichTextHtml(value: string | null | undefined) {
  return parseRichTextBlocks(value)
    .map((block) => {
      if (block.type === "heading") {
        return `<p><strong>${renderRichTextInlineHtml(block.text)}</strong></p>`;
      }
      if (block.type === "unordered_list") {
        return `<ul>${block.items.map((item) => `<li>${renderRichTextInlineHtml(item)}</li>`).join("")}</ul>`;
      }
      if (block.type === "ordered_list") {
        return `<ol>${block.items.map((item) => `<li>${renderRichTextInlineHtml(item)}</li>`).join("")}</ol>`;
      }
      return `<p>${block.lines.map((line) => renderRichTextInlineHtml(line)).join("<br />")}</p>`;
    })
    .join("");
}

export function renderRichTextPlain(value: string | null | undefined) {
  return parseRichTextBlocks(value)
    .map((block) => {
      if (block.type === "heading") return block.text;
      if (block.type === "unordered_list") return block.items.map((item) => `- ${stripInlineFormatting(item)}`).join("\n");
      if (block.type === "ordered_list") return block.items.map((item, index) => `${index + 1}. ${stripInlineFormatting(item)}`).join("\n");
      return block.lines.map((line) => stripInlineFormatting(line)).join("\n");
    })
    .join("\n\n");
}

export function renderRichTextInlineHtml(value: string) {
  const escaped = escapeHtml(String(value ?? ""));
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
}

function stripInlineFormatting(value: string) {
  return String(value ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(.+?)\*(?!\*)/g, "$1$2");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

