import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/setup-required";
import { hasSupabaseConfig } from "@/lib/env";
import { requireProfile } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) return <SetupRequired />;

  const profile = await requireProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
