import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppProfile, AppRole } from "@/lib/auth/roles";

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return data as AppProfile;
}

/**
 * Capture the current pathname (set by middleware as x-pathname) and include
 * it as ?next= on the login redirect so the user lands back where they were
 * after signing in. Falls back to bare /login when the header isn't present
 * (e.g. very early in app boot, or for routes not covered by middleware).
 *
 * Only forwards in-app paths — never an absolute URL — so this can't be used
 * as an open-redirect vector.
 */
async function loginRedirectTarget() {
  try {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";
    if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/login";
    if (pathname === "/login" || pathname === "/dashboard") return "/login";
    return `/login?next=${encodeURIComponent(pathname)}`;
  } catch {
    return "/login";
  }
}

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect((await loginRedirectTarget()) as never);
  return profile;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const profile = await requireProfile();
  if (!allowedRoles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
