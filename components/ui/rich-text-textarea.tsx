"use client";

import { Bold, Heading1, Italic, List, ListOrdered } from "lucide-react";
import { useRef } from "react";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type RichTextTool = "bold" | "italic" | "heading" | "bullet" | "number";

const toolConfig: Record<RichTextTool, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  bold: { label: "Bold", icon: Bold },
  italic: { label: "Italic", icon: Italic },
  heading: { label: "Heading", icon: Heading1 },
  bullet: { label: "Bullet", icon: List },
  number: { label: "Numbered", icon: ListOrdered }
};

export function RichTextTextarea({
  tools = ["bold", "italic", "heading", "bullet", "number"],
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { tools?: RichTextTool[] }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function applyTool(tool: RichTextTool) {
    const textarea = ref.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const currentValue = textarea.value;
    const selectedText = currentValue.slice(start, end);
    let nextValue = currentValue;
    let nextStart = start;
    let nextEnd = end;

    if (tool === "bold") {
      const text = selectedText || "bold text";
      nextValue = `${currentValue.slice(0, start)}**${text}**${currentValue.slice(end)}`;
      nextStart = start + 2;
      nextEnd = start + 2 + text.length;
    } else if (tool === "italic") {
      const text = selectedText || "italic text";
      nextValue = `${currentValue.slice(0, start)}*${text}*${currentValue.slice(end)}`;
      nextStart = start + 1;
      nextEnd = start + 1 + text.length;
    } else {
      const blockText = selectedText || "";
      const lineStart = currentValue.lastIndexOf("\n", start - 1) + 1;
      const lineEndIndex = end === start ? currentValue.indexOf("\n", end) : currentValue.lastIndexOf("\n", end - 1);
      const lineEnd = lineEndIndex === -1 ? currentValue.length : currentValue.indexOf("\n", end) === -1 ? currentValue.length : currentValue.indexOf("\n", end);
      const targetStart = end === start ? lineStart : lineStart;
      const targetEnd = end === start ? lineEnd : Math.max(end, lineEnd);
      const targetText = currentValue.slice(targetStart, targetEnd);
      const lines = targetText.split("\n");
      const formatted = lines.map((line, index) => {
        const trimmed = line.trim();
        if (tool === "heading") return `# ${trimmed || "Heading"}`;
        if (tool === "bullet") return trimmed ? `- ${trimmed.replace(/^[-*•]\s+/, "")}` : "- Item";
        return `${index + 1}. ${trimmed.replace(/^\d+\.\s+/, "") || "Item"}`;
      });
      nextValue = `${currentValue.slice(0, targetStart)}${formatted.join("\n")}${currentValue.slice(targetEnd)}`;
      nextStart = targetStart;
      nextEnd = targetStart + formatted.join("\n").length;
    }

    textarea.value = nextValue;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(nextStart, nextEnd);
  }

  return (
    <div className="w-full rounded-md border border-[#d9ded1] bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-[#e6ebdc] bg-[#f8f9f4] p-2">
        {tools.map((tool) => {
          const Icon = toolConfig[tool].icon;
          return (
            <button
              key={tool}
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[#d9ded1] bg-white px-2 text-xs font-bold text-neutral-700 hover:border-[#a0ce4e]"
              onClick={() => applyTool(tool)}
            >
              <Icon className="h-3.5 w-3.5" />
              {toolConfig[tool].label}
            </button>
          );
        })}
      </div>
      <Textarea ref={ref} className={cn("min-h-24 w-full max-w-full resize-y border-0 shadow-none", className)} {...props} />
    </div>
  );
}

