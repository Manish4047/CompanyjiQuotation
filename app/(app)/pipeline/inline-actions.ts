"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Inline create actions used by the pipeline row comboboxes (Phase 4).
 *
 * Why a separate file from pipeline-setup/actions.ts: those actions all redirect
 * back to /pipeline-setup with a success/error query, which is correct for the
 * dedicated management page but wrong for an inline create that happens while
 * the user is in the middle of editing a pipeline row. These actions return a
 * structured result so the client can merge the new option into local state
 * and immediately select it without losing the row context.
 *
 * Permissions match the canonical actions: Admin or Manager can create a
 * folder or tag category inline.
 */

const createFolderInlineSchema = z.object({
  name: z.string().trim().min(2, "Folder name must be at least 2 characters.").max(80)
});

const createTagCategoryInlineSchema = z.object({
  name: z.string().trim().min(2, "Tag category must be at least 2 characters.").max(80)
});

const createTagInlineSchema = z.object({
  name: z.string().trim().min(2, "Tag must be at least 2 characters.").max(80),
  category_id: z.string().uuid()
});

export type FolderOptionDTO = { id: string; name: string };
export type TagCategoryDTO = { id: string; name: string };
export type TagOptionDTO = { id: string; name: string; category_id: string | null; category_name?: string | null };

export type InlineCreateFolderResult =
  | { ok: true; folder: FolderOptionDTO }
  | { ok: false; message: string };

export type InlineCreateTagCategoryResult =
  | { ok: true; category: TagCategoryDTO }
  | { ok: false; message: string };

export type InlineCreateTagResult =
  | { ok: true; tag: TagOptionDTO }
  | { ok: false; message: string };

export async function createFolderInline(input: { name: string }): Promise<InlineCreateFolderResult> {
  const parsed = createFolderInlineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid folder name." };
  }

  // Role gate. Matches pipeline-setup createQuoteFolder.
  const profile = await requireRole(["admin", "manager"]);
  const supabase = await createClient();

  // Quick existence check to give the user a clean "already exists" message
  // instead of relying on the DB unique violation. Case-insensitive match.
  const { data: existing } = await supabase
    .from("quote_folders")
    .select("id,name")
    .ilike("name", parsed.data.name)
    .maybeSingle();

  if (existing) {
    return { ok: true, folder: existing };
  }

  const { data, error } = await supabase
    .from("quote_folders")
    .insert({ name: parsed.data.name, description: "", sort_order: 100, active: true })
    .select("id,name")
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyInlineError(error?.message ?? "Could not create folder.") };
  }

  await supabase.rpc("log_activity", {
    action_type: "quote_folder_created_inline",
    details: { quote_folder_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/pipeline");
  revalidatePath("/pipeline-setup");

  return { ok: true, folder: data };
}

export async function createTagCategoryInline(input: { name: string }): Promise<InlineCreateTagCategoryResult> {
  const parsed = createTagCategoryInlineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid category name." };
  }

  const profile = await requireRole(["admin", "manager"]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("pipeline_tag_categories")
    .select("id,name")
    .ilike("name", parsed.data.name)
    .maybeSingle();

  if (existing) return { ok: true, category: existing };

  const { data, error } = await supabase
    .from("pipeline_tag_categories")
    .insert({ name: parsed.data.name, description: "", sort_order: 100, active: true })
    .select("id,name")
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyInlineError(error?.message ?? "Could not create tag category.") };
  }

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_category_created_inline",
    details: { pipeline_tag_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/pipeline");
  revalidatePath("/pipeline-setup");

  return { ok: true, category: data };
}

/**
 * Create a defined tag. The tag is automatically active and gets sort_order
 * 100 (the catch-all default). category_id is required because the schema
 * forces every tag to belong to a category — we use this in the row picker
 * via a small "Pick category" dropdown next to the new-tag input.
 */
export async function createTagInline(input: { name: string; category_id: string }): Promise<InlineCreateTagResult> {
  const parsed = createTagInlineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid tag." };
  }

  const profile = await requireRole(["admin", "manager"]);
  const supabase = await createClient();

  // Existence is checked per category — same tag name in a different category
  // is a distinct tag in the existing schema.
  const { data: existing } = await supabase
    .from("pipeline_tags")
    .select("id,name,category_id")
    .ilike("name", parsed.data.name)
    .eq("category_id", parsed.data.category_id)
    .maybeSingle();

  if (existing) {
    return { ok: true, tag: existing };
  }

  const { data, error } = await supabase
    .from("pipeline_tags")
    .insert({
      name: parsed.data.name,
      description: "",
      category_id: parsed.data.category_id,
      sort_order: 100,
      active: true
    })
    .select("id,name,category_id")
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyInlineError(error?.message ?? "Could not create tag.") };
  }

  await supabase.rpc("log_activity", {
    action_type: "pipeline_tag_created_inline",
    details: { pipeline_tag_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/pipeline");
  revalidatePath("/pipeline-setup");

  return { ok: true, tag: data };
}

function friendlyInlineError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache") || lower.includes("does not exist")) {
    return "Pipeline folders/tags tables are missing. Run migration 0006 in Supabase SQL Editor.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "Something with this name already exists.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You need Admin or Manager role to create folders or tags.";
  }
  return message;
}
