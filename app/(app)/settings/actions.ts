"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { syncClientsFromGoogleSheet } from "@/lib/google/client-sync";
import { syncLeadsFromGoogleSheet } from "@/lib/google/lead-sync";

const footerSettingsSchema = z.object({
  assistanceLabel: z.string().trim().min(1).max(60),
  assistancePhone: z.string().trim().min(1).max(40),
  consultancyLabel: z.string().trim().min(1).max(60),
  consultancyPhone: z.string().trim().min(1).max(40),
  whatsappLabel: z.string().trim().min(1).max(60),
  whatsappPhone: z.string().trim().min(1).max(40),
  footerLine: z.string().trim().min(1).max(160)
});

export async function updateQuoteFooterSettings(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const value = footerSettingsSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { error } = await supabase.from("app_settings").upsert({
    key: "quote_footer",
    value,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  });

  if (error) redirectWithSettingsError(error.message);

  await supabase.rpc("log_activity", {
    action_type: "quote_footer_settings_updated",
    details: { by: profile.email }
  });

  revalidatePath("/settings");
  revalidatePath("/quotes/new");
  redirect("/settings?success=Quotation footer settings saved");
}

export async function runGoogleClientSync() {
  const profile = await requireRole(["admin"]);

  try {
    const result = await syncClientsFromGoogleSheet();
    const supabase = await createClient();
    await supabase.rpc("log_activity", {
      action_type: "google_sheet_clients_synced",
      details: { ...result, by: profile.email }
    });
    revalidatePath("/clients");
    revalidatePath("/quotes/new");
    revalidatePath("/settings");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet sync failed";
    redirectWithSettingsError(message);
  }

  redirect("/settings?success=Google Sheet client sync completed");
}

export async function runGoogleLeadSync() {
  const profile = await requireRole(["admin"]);

  try {
    const result = await syncLeadsFromGoogleSheet();
    const supabase = await createClient();
    await supabase.rpc("log_activity", {
      action_type: "google_sheet_leads_synced",
      details: { ...result, by: profile.email }
    });
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    revalidatePath("/settings");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google lead sync failed";
    redirectWithSettingsError(message);
  }

  redirect("/settings?success=Google Sheet lead sync completed");
}

function redirectWithSettingsError(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}
