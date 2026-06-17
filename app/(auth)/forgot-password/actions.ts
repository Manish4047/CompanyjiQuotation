"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/app/routes";

export async function sendPasswordResetEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect(`${routes.forgotPassword}?message=Enter your email address` as never);
  }

  // Light email-shape validation so we don't waste a Supabase round-trip on
  // obviously-bad input, but we deliberately keep the user-facing response the
  // same regardless of whether the email matches a real account (see below).
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!looksLikeEmail) {
    redirect(`${routes.forgotPassword}?message=Enter a valid email address` as never);
  }

  const supabase = await createClient();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/callback?next=/reset-password`
  });

  // Two reasons we never surface the Supabase error message to the user:
  //  1) It can leak whether the email exists (account enumeration).
  //  2) Raw errors like "AuthApiError: ..." are confusing and not actionable.
  // We log it server-side so operators can still see rate-limit / config issues.
  if (error) {
    console.error("[forgot-password] resetPasswordForEmail failed:", error.message);
  }

  redirect(
    `${routes.forgotPassword}?success=${encodeURIComponent(
      "If that email is in our system, the reset link is on its way. Check your inbox in a minute."
    )}` as never
  );
}
