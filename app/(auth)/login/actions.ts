"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sanitize a `next` redirect target so it can only point to an in-app path.
 * Rejects absolute URLs, protocol-relative URLs ("//"), and anything that
 * could be used as an open-redirect. Returns "/dashboard" as the fallback.
 */
function safeNext(value: FormDataEntryValue | null | undefined): Route {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw as Route;
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    redirect(`/login?message=Enter your email and password${next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?message=Login failed. Check the email and password.${next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const profileStatus = await getProfileStatus(supabase);
  if (!profileStatus.ok) {
    await supabase.auth.signOut();
    redirect(`/login?message=${encodeURIComponent(profileStatus.message)}${next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  await supabase.rpc("log_activity", {
    action_type: "login",
    details: { method: "password" }
  });

  redirect(next);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Forward the next target through OAuth so /auth/callback can honor it.
      redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error || !data.url) {
    redirect("/login?message=Google login could not be started");
  }

  redirect(data.url as never);
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
