"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const clientIdentitySchema = z.object({
  client_id: z.string().uuid(),
  client_code: z.string().trim().min(2).max(60),
  group_id: z.string().trim().max(60).optional().or(z.literal("")),
  client_name: z.string().trim().min(2).max(180)
});

export async function updateClientIdentity(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = clientIdentitySchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .update({
      code: normalizeReferenceCode(parsed.client_code),
      group_id: parsed.group_id ? normalizeReferenceCode(parsed.group_id) : null,
      name: parsed.client_name
    })
    .eq("id", parsed.client_id)
    .select("id,name,code,group_id")
    .single();

  if (error || !data) {
    redirect(`/clients?error=${encodeURIComponent(friendlyClientError(error?.message ?? "Could not update client identity."))}`);
  }

  await supabase.rpc("log_activity", {
    action_type: "client_identity_updated",
    related_client_id: data.id,
    details: {
      client_name: data.name,
      client_code: data.code,
      group_id: data.group_id,
      by: profile.email
    }
  });

  revalidatePath("/clients");
  revalidatePath("/quotes");
  revalidatePath("/pipeline");

  redirect("/clients?success=Client identity updated");
}

function normalizeReferenceCode(value: string) {
  return value.trim().replace(/\s+/g, "-").toUpperCase();
}

function friendlyClientError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "That Client ID is already in use. Choose a different Client ID and try again.";
  }
  return message;
}
