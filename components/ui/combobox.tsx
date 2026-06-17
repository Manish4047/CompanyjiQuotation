"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type ComboboxProps = {
  /** Hidden form field name. The visible input is decorative; only this value submits. */
  name: string;
  /** Existing values to suggest. */
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  /** Show a "Create 'X'" row when the typed value doesn't match an existing option. */
  allowCreate?: boolean;
  required?: boolean;
  /** Optional id so a <label> with htmlFor can target the visible input. */
  id?: string;
  className?: string;
  /** Fires on every keystroke or selection — useful for live preview / search. */
  onValueChange?: (value: string) => void;
  /**
   * Fires only when the user commits a value: picks an option, presses Enter
   * on a highlighted option, creates a new value, or blurs the input after a
   * change. This is the right hook for autosave (no per-keystroke writes).
   */
  onCommit?: (value: string) => void;
};

/**
 * Typeahead picker with optional "Create new" affordance. The submitted value
 * is whatever the user types or selects — categories/tags created this way
 * become first-class because the server action accepts free text.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder,
  allowCreate = false,
  required = false,
  id,
  className,
  onValueChange,
  onCommit
}: ComboboxProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Track what was last committed so blur only commits when the value
  // actually changed since the last commit/initial value.
  const lastCommittedRef = useRef(defaultValue);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, value]);

  const exactMatch = useMemo(() => {
    const query = value.trim().toLowerCase();
    return query.length > 0 && options.some((option) => option.toLowerCase() === query);
  }, [options, value]);

  const showCreate = allowCreate && value.trim().length > 0 && !exactMatch;
  const totalItems = filtered.length + (showCreate ? 1 : 0);

  function commit(next: string) {
    setValue(next);
    onValueChange?.(next);
    if (next !== lastCommittedRef.current) {
      lastCommittedRef.current = next;
      onCommit?.(next);
    }
    setOpen(false);
    inputRef.current?.focus();
  }

  // Blur-commit: if the user typed freely and then tabbed/clicked away, treat
  // that as a commit too (matches the "fire on change" mental model of a text
  // input). Without this, free-typed values would only commit on Enter.
  function handleBlur() {
    // Defer slightly so a click on a dropdown option still wins.
    window.setTimeout(() => {
      if (open) return; // option click will run commit() instead.
      if (value !== lastCommittedRef.current) {
        lastCommittedRef.current = value;
        onCommit?.(value);
      }
    }, 120);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, Math.max(totalItems - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      // Don't submit the surrounding form on selection — Enter picks an option.
      if (open && totalItems > 0) {
        event.preventDefault();
        if (highlight < filtered.length) {
          commit(filtered[highlight] ?? value);
        } else if (showCreate) {
          commit(value.trim());
        }
      }
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          value={value}
          required={required}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${name}-listbox`}
          role="combobox"
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setHighlight(0);
            onValueChange?.(event.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="focus-ring min-h-11 w-full rounded-md border border-[#d9ded1] bg-white px-3 py-2 pr-10 text-sm text-black shadow-sm"
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle options"
          onPointerDown={(event) => {
            // Prevent the outside-click handler from closing immediately.
            event.preventDefault();
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-500"
        >
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {/* Hidden form value — the visible input has no name attribute so the
          combobox commits a single canonical value on submit. */}
      <input type="hidden" name={name} value={value} />

      {open ? (
        <ul
          id={`${name}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[#d9ded1] bg-white py-1 text-sm shadow-lg"
        >
          {filtered.length === 0 && !showCreate ? (
            <li className="px-3 py-2 text-xs text-neutral-500">No matches</li>
          ) : null}
          {filtered.map((option, index) => {
            const selected = option === value;
            const highlighted = highlight === index;
            return (
              <li
                key={option}
                role="option"
                aria-selected={selected}
                onPointerDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2",
                  highlighted ? "bg-[#eef2e6] text-black" : "text-neutral-700"
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center text-[#6a912f]">
                  {selected ? <Check className="h-4 w-4" /> : null}
                </span>
                <span className="truncate">{option}</span>
              </li>
            );
          })}
          {showCreate ? (
            <li
              role="option"
              aria-selected={false}
              onPointerDown={(event) => {
                event.preventDefault();
                commit(value.trim());
              }}
              onMouseEnter={() => setHighlight(filtered.length)}
              className={cn(
                "flex cursor-pointer items-center gap-2 border-t border-[#e6ebdc] px-3 py-2 text-[#405f16]",
                highlight === filtered.length ? "bg-[#eef2e6]" : ""
              )}
            >
              <Plus className="h-4 w-4" />
              <span className="truncate">
                Create &ldquo;<strong className="font-black">{value.trim()}</strong>&rdquo;
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
