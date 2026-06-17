"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  FolderTree,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon
} from "lucide-react";

const iconMap = {
  activity: Activity,
  barChart3: BarChart3,
  bookOpen: BookOpen,
  building2: Building2,
  calendarDays: CalendarDays,
  dashboard: LayoutDashboard,
  fileText: FileText,
  folderTree: FolderTree,
  megaphone: Megaphone,
  messageSquare: MessageSquare,
  settings: Settings,
  shieldCheck: ShieldCheck,
  users: Users
} satisfies Record<string, LucideIcon>;

export type AppNavItem = {
  href: string;
  label: string;
  icon: keyof typeof iconMap;
};

/**
 * Sidebar / mobile nav — highlights the route that matches the current URL.
 *
 * Matching rule: exact match wins; for non-root items we also match when the
 * pathname *starts with* the href + "/" so detail pages (e.g. /quotes/abc) still
 * highlight their list page.
 */
export function AppNav({
  items,
  variant
}: {
  items: ReadonlyArray<AppNavItem>;
  variant: "sidebar" | "mobile";
}) {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className={
        variant === "sidebar" ? "grid gap-1 p-4" : "mt-3 flex flex-col gap-1"
      }
      aria-label={variant === "sidebar" ? "Primary" : "Primary navigation"}
    >
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActive(pathname, item.href);

        if (variant === "sidebar") {
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition focus-ring",
                active
                  ? "bg-white/10 text-white"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {active ? (
                <span aria-hidden className="ml-auto h-2 w-2 rounded-full bg-[#a0ce4e]" />
              ) : null}
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition",
              active
                ? "border-[#a0ce4e] bg-[#edf7df] text-black"
                : "border-[#d9ded1] bg-white text-black hover:border-[#a0ce4e]"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function isActive(pathname: string, href: string) {
  if (href === pathname) return true;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(`${href}/`);
}
