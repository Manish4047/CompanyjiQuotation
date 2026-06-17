"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const folderSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100)
});

const tagCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100)
});

const tagSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  category_id: z.string().uuid(),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100)
});

export async function createQuoteFolder(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = parseFolder(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_folders").insert(parsed).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "quote_folder_created",
    details: { quote_folder_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Folder saved" as Route);
}

export async function updateQuoteFolder(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseFolder(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_folders").update(parsed).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "quote_folder_updated",
    details: { quote_folder_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Folder updated" as Route);
}

export async function toggleQuoteFolderActive(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_folders").update({ active }).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "quote_folder_activated" : "quote_folder_deactivated",
    details: { quote_folder_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Folder status updated" as Route);
}

export async function deleteQuoteFolder(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.from("quote_folders").delete().eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "quote_folder_deleted",
    details: { quote_folder_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Folder deleted" as Route);
}

export async function createPipelineTagCategory(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = parseTagCategory(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tag_categories").insert(parsed).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_category_created",
    details: { pipeline_tag_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag category saved" as Route);
}

export async function updatePipelineTagCategory(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseTagCategory(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tag_categories").update(parsed).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_category_updated",
    details: { pipeline_tag_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag category updated" as Route);
}

export async function togglePipelineTagCategoryActive(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tag_categories").update({ active }).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "pipeline_tag_category_activated" : "pipeline_tag_category_deactivated",
    details: { pipeline_tag_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag category status updated" as Route);
}

export async function deletePipelineTagCategory(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tag_categories").delete().eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_category_deleted",
    details: { pipeline_tag_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag category deleted" as Route);
}

export async function createPipelineTag(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = parseTag(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tags").insert(parsed).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_created",
    details: { pipeline_tag_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag saved" as Route);
}

export async function updatePipelineTag(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseTag(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tags").update(parsed).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_updated",
    details: { pipeline_tag_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag updated" as Route);
}

export async function togglePipelineTagActive(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tags").update({ active }).eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "pipeline_tag_activated" : "pipeline_tag_deactivated",
    details: { pipeline_tag_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag status updated" as Route);
}

export async function deletePipelineTag(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.from("pipeline_tags").delete().eq("id", id).select("id,name").single();
  if (error) redirectWithPipelineSetupError(friendlyPipelineSetupError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_deleted",
    details: { pipeline_tag_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePipelineSetup();
  redirect("/pipeline-setup?success=Tag deleted" as Route);
}

function parseFolder(formData: FormData) {
  const parsed = folderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithPipelineSetupError(parsed.error.issues[0]?.message ?? "Please check the folder details.");
  return { ...parsed.data, active: formData.has("active") };
}

function parseTagCategory(formData: FormData) {
  const parsed = tagCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithPipelineSetupError(parsed.error.issues[0]?.message ?? "Please check the tag category details.");
  return { ...parsed.data, active: formData.has("active") };
}

function parseTag(formData: FormData) {
  const parsed = tagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithPipelineSetupError(parsed.error.issues[0]?.message ?? "Please check the tag details.");
  return { ...parsed.data, active: formData.has("active") };
}

function revalidatePipelineSetup() {
  revalidatePath("/pipeline");
  revalidatePath("/pipeline-setup");
  revalidatePath("/campaigns");
  revalidatePath("/quotes");
  revalidatePath("/quotes/new");
}

function redirectWithPipelineSetupError(message: string): never {
  redirect(`/pipeline-setup?error=${encodeURIComponent(message)}` as Route);
}

function friendlyPipelineSetupError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache") || lower.includes("column")) {
    return "Pipeline folders and tags are missing in the database. Run migration 0006 in Supabase SQL Editor.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "This name already exists. Please use a different one.";
  }
  if (lower.includes("foreign key")) {
    return "This item is still linked somewhere in the CRM. Move those records first, then delete it.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You need an active Admin or Manager profile to manage pipeline folders and tags.";
  }
  return message;
}
