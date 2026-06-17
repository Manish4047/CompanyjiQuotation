"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { createFolderInline, type FolderOptionDTO } from "@/app/(app)/pipeline/inline-actions";
import { cn } from "@/lib/utils";

type FolderPickerProps = {
  folders: FolderOptionDTO[];
  value: string | null;
  /** Called with the folder id (or null for "Unfiled"). */
  onChange: (next: string | null) => void;
  /** Called when a new folder is created so the parent can merge it into state. */
  onFolderCreated?: (folder: FolderOptionDTO) => void;
  /** Hide the "Create" affordance when the current viewer can't manage folders. */
  canCreate?: boolean;
  className?: string;
};

/**
 * Combobox-style folder picker with an inline "Create folder" option.
 *
 * Replaces the bare <select> in the pipeline row so the user doesn't have to
 * bounce to /pipeline-setup just to file a quote into a new folder.
 * Read-only viewers (non-admin, non-manager) still see the picker but the
 * Create row is hidden — they can only file into existing folders.
 */
export function FolderPicker({
  folders,
  value,
  onChange,
  onFolderCreated,
  canCreate = true,
  className
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [creating, startCreate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => folders.find((folder) => folder.id === value) ?? null,
    [folders, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(q));
  }, [folders, query]);

  const trimmed = query.trim();
  const exact = trimmed
    ? folders.find((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())
    : null;
  const showCreate = canCreate && trimmed.length >= 2 && !exact;

  // Close on outside click. Tracked at document level because the dropdown is
  // positioned absolutely outside the button's natural focus area.
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

  function commitFolder(folderId: string | null) {
    onChange(folderId);
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }

  function handleCreate() {
    if (!trimmed || creating) return;
    setError(null);
    startCreate(async () => {
      const result = await createFolderInline({ name: trimmed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onFolderCreated?.(result.folder);
      commitFolder(result.folder.id);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const totalItems = filtered.length + (showCreate ? 1 : 0) + 1; // +1 for "Unfiled"

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
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      // 0 = Unfiled; 1..filtered.length = filtered folder; last = Create
      if (highlight === 0) {
        commitFolder(null);
      } else if (highlight - 1 < filtered.length) {
        commitFolder(filtered[highlight - 1].id);
      } else if (showCreate) {
        handleCreate();
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
        className="focus-ring inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-[#d9ded1] bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-black"
      >
        <span className={cn("truncate", !selected && "text-neutral-500")}>
          {selected ? selected.name : "Unfiled"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-400 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-[#d9ded1] bg-white shadow-lg">
          <div className="border-b border-[#e6ebdc] p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or type new name…"
              className="focus-ring w-full rounded-md border border-[#d9ded1] bg-white px-2 py-1.5 text-xs text-black"
              autoComplete="off"
            />
          </div>

          {error ? (
            <p className="border-b border-[#fff0ed] bg-[#fff7f5] px-3 py-2 text-[11px] font-bold text-[#b42318]">
              {error}
            </p>
          ) : null}

          <ul role="listbox" className="max-h-56 overflow-y-auto py-1 text-xs">
            <Option
              label="Unfiled"
              selected={value === null}
              highlighted={highlight === 0}
              onMouseEnter={() => setHighlight(0)}
              onClick={() => commitFolder(null)}
              muted
            />
            {filtered.length === 0 && !showCreate && trimmed ? (
              <li className="px-3 py-2 text-[11px] text-neutral-500">No matches</li>
            ) : null}
            {filtered.map((folder, index) => (
              <Option
                key={folder.id}
                label={folder.name}
                selected={folder.id === value}
                highlighted={highlight === index + 1}
                onMouseEnter={() => setHighlight(index + 1)}
                onClick={() => commitFolder(folder.id)}
              />
            ))}
            {showCreate ? (
              <li
                role="option"
                aria-selected={false}
                onMouseEnter={() => setHighlight(filtered.length + 1)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleCreate();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border-t border-[#e6ebdc] px-3 py-2 text-[#405f16]",
                  highlight === filtered.length + 1 ? "bg-[#eef2e6]" : ""
                )}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span className="truncate">
                  Create folder &ldquo;<strong className="font-black">{trimmed}</strong>&rdquo;
                </span>
              </li>
            ) : null}
          </ul>

          {!canCreate ? (
            <p className="border-t border-[#e6ebdc] px-3 py-2 text-[11px] text-neutral-500">
              Ask an Admin or Manager to add a new folder.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Option({
  label,
  selected,
  highlighted,
  onMouseEnter,
  onClick,
  muted
}: {
  label: string;
  selected: boolean;
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      onMouseEnter={onMouseEnter}
      onPointerDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 px-3 py-2",
        highlighted ? "bg-[#eef2e6] text-black" : muted ? "text-neutral-500" : "text-neutral-700"
      )}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center text-[#6a912f]">
        {selected ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="truncate">{label}</span>
      {selected && muted ? <X className="ml-auto h-3 w-3 text-neutral-400" /> : null}
    </li>
  );
}
