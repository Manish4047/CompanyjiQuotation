import { redirect } from "next/navigation";
import {
  LogOut,
  MenuSquare,
} from "lucide-react";
import { AppNav, type AppNavItem } from "@/components/layout/app-nav";
import { createClient } from "@/lib/supabase/server";
import { roleLabel, type AppProfile } from "@/lib/auth/roles";

const navItems: ReadonlyArray<AppNavItem> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/leads", label: "Leads", icon: "users" },
  { href: "/whatsapp-inbox", label: "WhatsApp Inbox", icon: "messageSquare" },
  { href: "/quotes/new", label: "New Quote", icon: "fileText" },
  { href: "/quotes", label: "Quotes", icon: "fileText" },
  { href: "/pipeline", label: "Pipeline", icon: "barChart3" },
  { href: "/clients", label: "Clients", icon: "users" },
  { href: "/companies", label: "Companies", icon: "building2" },
  { href: "/compliance", label: "Compliance", icon: "calendarDays" },
  { href: "/services", label: "Services", icon: "shieldCheck" },
  { href: "/documents", label: "Documents", icon: "bookOpen" },
  { href: "/canned-messages", label: "Messages", icon: "messageSquare" },
  { href: "/pipeline-setup", label: "Pipeline Setup", icon: "folderTree" },
  { href: "/campaigns", label: "Campaigns & Lists", icon: "megaphone" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/settings", label: "Settings", icon: "settings" }
];

export function AppShell({ profile, children }: { profile: AppProfile; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* Keyboard skip-link so tab users don't traverse 14 nav items every page */}
      <a
        href="#main-content"
        className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-sm focus:font-black focus:text-[#a0ce4e]"
      >
        Skip to main content
      </a>

      <aside className="no-print fixed inset-y-0 left-0 hidden w-72 border-r border-[#d9ded1] bg-black text-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-[#a0ce4e] font-black text-black">Cj</div>
              <div className="min-w-0">
                <p className="text-lg font-black">Companyji</p>
                <p className="text-xs text-neutral-400">Lead + Quote CRM</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <AppNav items={navItems} variant="sidebar" />
          </div>

          <div className="mt-auto border-t border-white/10 p-4">
            <div className="rounded-md bg-white/8 p-3">
              <p className="truncate text-sm font-bold" title={profile.full_name}>
                {profile.full_name}
              </p>
              <p className="truncate text-xs text-neutral-400" title={profile.email}>
                {roleLabel(profile.role)} · {profile.email}
              </p>
            </div>
            <form action={signOut} className="mt-3">
              <button
                type="submit"
                className="focus-ring flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-white/15 text-sm font-semibold text-neutral-200 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="no-print sticky top-0 z-20 border-b border-[#d9ded1] bg-[#f4f4f4]/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[#a0ce4e] font-black text-black">Cj</div>
              <div className="min-w-0">
                <p className="truncate font-black" title={profile.full_name}>
                  {profile.full_name}
                </p>
                <p className="text-xs text-neutral-500">{roleLabel(profile.role)}</p>
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="focus-ring rounded-md border border-[#d9ded1] bg-white p-2"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* All 14 routes are reachable via the collapsible "All pages" menu so
              mobile users aren't stranded on the first seven entries. */}
          <details className="mt-3 rounded-md border border-[#d9ded1] bg-white">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-black text-black">
              <MenuSquare className="h-4 w-4" />
              All pages
            </summary>
            <div className="border-t border-[#e6ebdc] p-3">
              <AppNav items={navItems} variant="mobile" />
            </div>
          </details>
        </header>

        <main id="main-content" tabIndex={-1} className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

async function signOut() {
  "use server";

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
