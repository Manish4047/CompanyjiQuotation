import { cn } from "@/lib/utils";
import { parseRichTextBlocks, renderRichTextInlineHtml } from "@/lib/rich-text";

export function RichTextContent({ value, className }: { value: string | null | undefined; className?: string }) {
  const blocks = parseRichTextBlocks(value);
  if (!blocks.length) return null;

  return (
    <div className={cn("space-y-2 text-sm leading-6 text-neutral-700", className)}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <p key={`heading-${index}`} className="font-black text-black" dangerouslySetInnerHTML={{ __html: renderRichTextInlineHtml(block.text) }} />;
        }
        if (block.type === "unordered_list") {
          return (
            <ul key={`ul-${index}`} className="space-y-1 pl-5 list-disc">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderRichTextInlineHtml(item) }} />
              ))}
            </ul>
          );
        }
        if (block.type === "ordered_list") {
          return (
            <ol key={`ol-${index}`} className="space-y-1 pl-5 list-decimal">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${index}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderRichTextInlineHtml(item) }} />
              ))}
            </ol>
          );
        }
        return (
          <p key={`p-${index}`}>
            {block.lines.map((line, lineIndex) => (
              <span key={`p-${index}-${lineIndex}`}>
                {lineIndex ? <br /> : null}
                <span dangerouslySetInnerHTML={{ __html: renderRichTextInlineHtml(line) }} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

