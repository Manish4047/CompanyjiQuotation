import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    const profileStatus = await getProfileStatus(supabase);
    if (!profileStatus.ok) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent(profileStatus.message)}`);
    }

    await supabase.rpc("log_activity", {
      action_type: next === "/reset-password" ? "password_recovery_link_opened" : "login",
      details: { method: next === "/reset-password" ? "password_recovery" : "oauth" }
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

async function getProfileStatus(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      message: "Login worked, but the session could not be confirmed. Please try again."
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      ok: false as const,
      message: "This email can sign in to Supabase, but it has not been added to Companyji CRM yet. Ask Admin to create the profile row."
    };
  }

  if (!profile.active) {
    return {
      ok: false as const,
      message: "This CRM user is currently inactive. Ask Admin to reactivate the profile."
    };
  }

  return { ok: true as const };
}
