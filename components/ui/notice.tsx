import { cn } from "@/lib/utils";

type NoticeTone = "green" | "red" | "amber";

const toneClasses: Record<NoticeTone, string> = {
  green: "border-[#d9ead3] bg-[#edf7df] text-[#405f16]",
  red: "border-[#f4c7c3] bg-[#fff0ed] text-[#b42318]",
  amber: "border-[#f0d896] bg-[#fff7df] text-[#7a5200]"
};

/**
 * A small dismissable-style banner. Used for success / error / warning callouts
 * across forms and pages.
 *
 * `role="status"` (polite) is used for success/info, `role="alert"` (assertive)
 * for errors so screen readers announce them appropriately.
 */
export function Notice({
  tone,
  children,
  className
}: {
  tone: NoticeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const isError = tone === "red";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "rounded-md border p-4 text-sm font-semibold",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
