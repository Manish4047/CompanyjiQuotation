"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const cannedMessageSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(3000),
  use_case: z.string().trim().min(2).max(80).default("quote_note")
});

export async function createCannedMessage(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = parseCannedMessage(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("canned_messages").insert(parsed).select("id,title").single();
  if (error) redirectWithCannedMessageError(friendlyCannedMessageError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "canned_message_created",
    details: { canned_message_id: data.id, title: data.title, by: profile.email }
  });

  revalidatePath("/canned-messages");
  revalidatePath("/quotes/new");
  redirect("/canned-messages?success=Message saved" as Route);
}

export async function updateCannedMessage(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseCannedMessage(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("canned_messages").update(parsed).eq("id", id).select("id,title").single();
  if (error) redirectWithCannedMessageError(friendlyCannedMessageError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "canned_message_updated",
    details: { canned_message_id: data.id, title: data.title, by: profile.email }
  });

  revalidatePath("/canned-messages");
  revalidatePath("/quotes/new");
  redirect("/canned-messages?success=Message updated" as Route);
}

export async function toggleCannedMessageActive(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("canned_messages").update({ active }).eq("id", id).select("id,title").single();
  if (error) redirectWithCannedMessageError(friendlyCannedMessageError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "canned_message_activated" : "canned_message_deactivated",
    details: { canned_message_id: data.id, title: data.title, by: profile.email }
  });

  revalidatePath("/canned-messages");
  revalidatePath("/quotes/new");
  redirect("/canned-messages?success=Message status updated" as Route);
}

function parseCannedMessage(formData: FormData) {
  const parsed = cannedMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectWithCannedMessageError(parsed.error.issues[0]?.message ?? "Please check the message details.");
  }
  return { ...parsed.data, active: formData.has("active") };
}

function redirectWithCannedMessageError(message: string): never {
  redirect(`/canned-messages?error=${encodeURIComponent(message)}` as Route);
}

function friendlyCannedMessageError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache")) {
    return "The database is missing the canned message library. Run supabase/migrations/0003_quote_composer_libraries.sql in Supabase SQL Editor.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "A message with this category and title already exists.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You need an active Admin profile to manage canned messages.";
  }
  return message;
}
