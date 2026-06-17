"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { followupBucketFor as pipelineFollowupBucketFor, followupLabelFor, type PipelineFollowupBucket } from "@/lib/pipeline-insights";
import { cn } from "@/lib/utils";

type FollowupChipProps = {
  value: string | null;
  onChange: (next: string | null) => void;
  readOnly?: boolean;
  size?: "sm" | "md";
};

/**
 * Single, opinionated follow-up display + edit affordance.
 *
 * Why it has its own component: follow-up date is the most important piece of
 * pipeline data after status, and the existing UI buried it inside a wide
 * table column. Bringing it into a chip with a colour rule means a user can
 * scan a board column and instantly see which leads are overdue without
 * reading any text.
 */
export function FollowupChip({ value, onChange, readOnly, size = "md" }: FollowupChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const bucket = pipelineFollowupBucketFor(value);
  const label = followupLabelFor(value, bucket);

  function commit(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  function shiftFromToday(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function shiftFromCurrent(days: number) {
    if (!value) return shiftFromToday(days);
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => !readOnly && setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "focus-ring inline-flex items-center gap-1.5 rounded-full font-bold transition",
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          readOnly ? "cursor-default" : "cursor-pointer",
          toneClassesFor(bucket)
        )}
      >
        <CalendarClock className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <span>{label}</span>
      </button>

      {open && !readOnly ? (
        <div
          role="dialog"
          aria-label="Set follow-up"
          className="absolute left-0 top-full z-40 mt-2 w-64 rounded-md border border-[#d9ded1] bg-white p-3 shadow-lg"
        >
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Snooze follow-up</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <SnoozeButton onClick={() => commit(shiftFromToday(1))}>+1d</SnoozeButton>
            <SnoozeButton onClick={() => commit(shiftFromToday(3))}>+3d</SnoozeButton>
            <SnoozeButton onClick={() => commit(shiftFromToday(7))}>+7d</SnoozeButton>
            <SnoozeButton onClick={() => commit(shiftFromCurrent(1))} secondary>
              Push 1d
            </SnoozeButton>
            <SnoozeButton onClick={() => commit(shiftFromCurrent(3))} secondary>
              Push 3d
            </SnoozeButton>
            <SnoozeButton onClick={() => commit(shiftFromCurrent(7))} secondary>
              Push 7d
            </SnoozeButton>
          </div>
          <label className="mt-3 grid gap-1 text-[11px] font-black uppercase tracking-wide text-neutral-500">
            Custom date
            <input
              type="date"
              value={value ?? ""}
              onChange={(event) => commit(event.target.value || null)}
              className="focus-ring min-h-10 rounded-md border border-[#d9ded1] bg-white px-2 py-1.5 text-sm text-black"
            />
          </label>
          {value ? (
            <button
              type="button"
              onClick={() => commit(null)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#b42318] hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              Clear follow-up
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SnoozeButton({
  children,
  onClick,
  secondary
}: {
  children: React.ReactNode;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring min-h-9 rounded-md text-xs font-bold transition",
        secondary
          ? "border border-[#d9ded1] bg-white text-neutral-700 hover:bg-[#eef2e6]"
          : "bg-[#a0ce4e] text-black hover:bg-[#8fbb43]"
      )}
    >
      {children}
    </button>
  );
}

function toneClassesFor(bucket: PipelineFollowupBucket) {
  switch (bucket) {
    case "overdue":
      return "bg-[#fff0ed] text-[#b42318] hover:bg-[#fce0db]";
    case "today":
      return "bg-[#fff7df] text-[#7a5200] hover:bg-[#fbedc7]";
    case "this_week":
      return "bg-[#edf7df] text-[#47651d] hover:bg-[#e0f0c8]";
    case "future":
      return "bg-[#eef2e6] text-[#3f5126] hover:bg-[#e3eada]";
    case "none":
    default:
      return "border border-dashed border-[#d9ded1] bg-white text-neutral-500 hover:bg-[#fbfcf8]";
  }
}

export function followupBucketFor(value: string | null) {
  return pipelineFollowupBucketFor(value);
}
