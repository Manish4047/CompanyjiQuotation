"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-neutral-700">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-normal text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  const { className, type, onWheel, inputMode, ...rest } = props;
  return (
    <input
      ref={ref}
      type={type}
      inputMode={type === "number" ? inputMode ?? "numeric" : inputMode}
      onWheel={
        type === "number"
          ? (event) => {
              event.currentTarget.blur();
              onWheel?.(event);
            }
          : onWheel
      }
      className={cn(
        "focus-ring min-h-11 w-full rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm text-black shadow-sm",
        className
      )}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "focus-ring min-h-11 w-full rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm text-black shadow-sm",
        props.className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "focus-ring min-h-28 w-full max-w-full resize-y rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm text-black shadow-sm",
        props.className
      )}
      {...props}
    />
  );
});
