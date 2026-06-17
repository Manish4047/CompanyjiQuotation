"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const documentTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().max(1000).default("")
});

const documentCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100)
});

export async function createDocumentTemplate(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = parseDocumentTemplate(formData);
  const supabase = await createClient();
  const category = await resolveDocumentCategory(supabase, parsed.category_id);

  const { data, error } = await supabase
    .from("document_templates")
    .insert({
      name: parsed.name,
      description: parsed.description,
      category: category.name,
      category_id: category.id,
      active: parsed.active
    })
    .select("id,name")
    .single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "document_template_created",
    details: { document_template_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Document saved" as Route);
}

export async function updateDocumentTemplate(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseDocumentTemplate(formData);
  const supabase = await createClient();
  const category = await resolveDocumentCategory(supabase, parsed.category_id);

  const { data, error } = await supabase
    .from("document_templates")
    .update({
      name: parsed.name,
      description: parsed.description,
      category: category.name,
      category_id: category.id,
      active: parsed.active
    })
    .eq("id", id)
    .select("id,name")
    .single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "document_template_updated",
    details: { document_template_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Document updated" as Route);
}

export async function toggleDocumentTemplateActive(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("document_templates").update({ active }).eq("id", id).select("id,name").single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "document_template_activated" : "document_template_deactivated",
    details: { document_template_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Document status updated" as Route);
}

export async function createDocumentCategory(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const parsed = parseDocumentCategory(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("document_categories").insert(parsed).select("id,name").single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.rpc("log_activity", {
    action_type: "document_category_created",
    details: { document_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Category saved" as Route);
}

export async function updateDocumentCategory(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const parsed = parseDocumentCategory(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.from("document_categories").update(parsed).eq("id", id).select("id,name").single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.from("document_templates").update({ category: data.name }).eq("category_id", data.id);

  await supabase.rpc("log_activity", {
    action_type: "document_category_updated",
    details: { document_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Category updated" as Route);
}

export async function toggleDocumentCategoryActive(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();

  const { data, error } = await supabase.from("document_categories").update({ active }).eq("id", id).select("id,name").single();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));

  await supabase.rpc("log_activity", {
    action_type: active ? "document_category_activated" : "document_category_deactivated",
    details: { document_category_id: data.id, name: data.name, by: profile.email }
  });

  revalidatePath("/documents");
  revalidatePath("/services");
  redirect("/documents?success=Category status updated" as Route);
}

function parseDocumentTemplate(formData: FormData) {
  const parsed = documentTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithDocumentError(parsed.error.issues[0]?.message ?? "Please check the document details.");
  return { ...parsed.data, active: formData.has("active") };
}

function parseDocumentCategory(formData: FormData) {
  const parsed = documentCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirectWithDocumentError(parsed.error.issues[0]?.message ?? "Please check the category details.");
  return { ...parsed.data, active: formData.has("active") };
}

async function resolveDocumentCategory(supabase: Awaited<ReturnType<typeof createClient>>, categoryId: string | undefined) {
  if (categoryId) {
    const { data, error } = await supabase.from("document_categories").select("id,name").eq("id", categoryId).maybeSingle();
    if (error) redirectWithDocumentError(friendlyDocumentError(error.message));
    if (data) return data as { id: string; name: string };
  }

  const { data, error } = await supabase.from("document_categories").select("id,name").eq("name", "General").maybeSingle();
  if (error) redirectWithDocumentError(friendlyDocumentError(error.message));
  if (data) return data as { id: string; name: string };

  return { id: null, name: "General" } as { id: string | null; name: string };
}

function redirectWithDocumentError(message: string): never {
  redirect(`/documents?error=${encodeURIComponent(message)}` as Route);
}

function friendlyDocumentError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache")) {
    return "The database is missing the document library. Run migrations 0003 and 0004 in Supabase SQL Editor.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "A document with this category and name already exists.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You need an active Admin profile to manage document templates.";
  }
  return message;
}
