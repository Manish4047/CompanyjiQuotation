import { cn } from "@/lib/utils";

type StatusPillProps = {
  children: React.ReactNode;
  tone?: "green" | "black" | "amber" | "red" | "muted";
};

export function StatusPill({ children, tone = "muted" }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold",
        tone === "green" && "bg-[#edf7df] text-[#47651d]",
        tone === "black" && "bg-black text-white",
        tone === "amber" && "bg-[#fff7df] text-[#7a5200]",
        tone === "red" && "bg-[#fff0ed] text-[#b42318]",
        tone === "muted" && "bg-neutral-100 text-neutral-600"
      )}
    >
      {children}
    </span>
  );
}
