"use client";

import { AlertTriangle, Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

/**
 * "Copy WhatsApp brief" + "Open PDF sheet".
 *
 * Two reliability improvements over the prior version:
 *  1) `navigator.clipboard` is unavailable on non-HTTPS hosts and some embedded
 *     contexts. We try the modern API, fall back to the legacy `execCommand`
 *     trick, and finally show a visible warning so the user can copy manually.
 *  2) The "Open PDF sheet" action used to be a button calling `window.open`,
 *     which pop-up blockers ate. It's now a real `<a target="_blank">` so the
 *     click is a user gesture and routes through normal browser navigation.
 */
export function QuoteShareTools({
  whatsappMessage,
  printHref
}: {
  whatsappMessage: string;
  printHref: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyMessage() {
    if (await tryCopyToClipboard(whatsappMessage)) {
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
      return;
    }
    setCopyState("failed");
  }

  return (
    <div className="grid gap-3">
      <Textarea
        className="min-h-44 text-xs leading-5"
        value={whatsappMessage}
        readOnly
        aria-label="WhatsApp brief"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={copyMessage}>
          {copyState === "copied" ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : copyState === "failed" ? (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Select the text manually"
              : "Copy WhatsApp brief"}
        </Button>
        <a
          href={printHref}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#d9ded1] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#eef2e6]"
        >
          <Printer className="h-4 w-4" aria-hidden />
          Open PDF sheet
        </a>
      </div>
      {copyState === "failed" ? (
        <p
          role="alert"
          aria-live="assertive"
          className="text-xs font-semibold text-[#b42318]"
        >
          Couldn&apos;t copy automatically. Select the text above and use Ctrl/Cmd-C.
        </p>
      ) : null}
    </div>
  );
}

async function tryCopyToClipboard(value: string) {
  // Modern path: requires HTTPS / Permissions-Policy "clipboard-write".
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy path: works on every browser but only inside a user gesture, which
  // this is. Marked deprecated but stable as a fallback.
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  return false;
}
