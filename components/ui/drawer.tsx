"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  /** If true, the form action is inside <children> and should not be wrapped here. */
  hideClose?: boolean;
};

/**
 * Right-side slide-over panel. Used by services / pipeline / comments redesigns.
 *
 * Why a custom drawer instead of a library: we already have a custom design
 * language (CSS vars + small Tailwind palette) and no existing dialog system.
 * Pulling in @radix-ui/react-dialog for a single use-case would balloon the
 * bundle. The behaviour we need is small enough to write directly.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = "w-full sm:w-[480px] lg:w-[640px]",
  hideClose
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Lock body scroll, restore focus on close, and handle ESC.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);

    // Move focus into the panel on the next tick so the panel mounts first.
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button, [tabindex]:not([tabindex='-1'])"
      );
      focusable?.focus();
    }, 30);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = originalOverflow;
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close panel"
        className="flex-1 bg-black/40 transition focus:outline-none"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          "flex h-full flex-col bg-white shadow-2xl ring-1 ring-black/5",
          "animate-[slideInRight_180ms_ease-out]",
          widthClass
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#e6ebdc] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-black">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p>
            ) : null}
          </div>
          {hideClose ? null : (
            <button
              type="button"
              onClick={onClose}
              className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d9ded1] bg-white text-neutral-600 hover:bg-[#eef2e6]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="border-t border-[#e6ebdc] bg-[#fbfcf8] px-5 py-3">{footer}</footer>
        ) : null}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(24px); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
