import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  // Intentionally don't default `type` — the HTML default ("submit" inside a
  // form) is what existing callers rely on. Callers that need a non-submitting
  // button pass `type="button"` explicitly.
  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
        // Consistent disabled styling so users always see when a primary action
        // is gated by missing input.
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-current",
        variant === "primary" && "bg-[#a0ce4e] text-black hover:bg-[#8fbb43] disabled:hover:bg-[#a0ce4e]",
        variant === "secondary" && "border border-black bg-black text-white hover:bg-neutral-800 disabled:hover:bg-black",
        variant === "ghost" && "border border-[#d9ded1] bg-white text-black hover:bg-[#eef2e6] disabled:hover:bg-white",
        variant === "danger" && "bg-[#b42318] text-white hover:bg-[#8f1c13] disabled:hover:bg-[#b42318]",
        className
      )}
      {...props}
    />
  );
}
