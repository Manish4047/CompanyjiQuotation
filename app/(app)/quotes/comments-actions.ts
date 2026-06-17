"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Comments live in their own table (quote_comments) — see migration 0012.
 * Each edit creates a new row with revision_of pointing at the previous
 * version, and old rows are marked edited_at so the timeline can hide them
 * by default but still expose them via "view history".
 *
 * Soft deletes set deleted_at + deleted_by. Hard delete is intentionally not
 * exposed; if you ever need GDPR-style erasure, do it through the service-role
 * key directly.
 */

export type QuoteCommentRow = {
  id: string;
  quote_id: string;
  author_id: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  revision_of: string | null;
  deleted_at: string | null;
};

export type CommentActionResult =
  | { ok: true; comment: QuoteCommentRow }
  | { ok: false; message: string };

export type CommentMutationResult = { ok: true } | { ok: false; message: string };

const addCommentSchema = z.object({
  quote_id: z.string().uuid(),
  body: z.string().trim().min(1, "Type something before saving.").max(4000)
});

const editCommentSchema = z.object({
  comment_id: z.string().uuid(),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(4000)
});

const deleteCommentSchema = z.object({
  comment_id: z.string().uuid()
});

export async function addQuoteComment(input: z.infer<typeof addCommentSchema>): Promise<CommentActionResult> {
  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const profile = await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_comments")
    .insert({
      quote_id: parsed.data.quote_id,
      author_id: profile.id,
      body: parsed.data.body
    })
    .select("id,quote_id,author_id,body,created_at,edited_at,revision_of,deleted_at")
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyCommentError(error?.message ?? "Could not save comment.") };
  }

  await supabase.rpc("log_activity", {
    action_type: "quote_comment_added",
    related_quote_id: parsed.data.quote_id,
    details: {
      comment_id: data.id,
      by: profile.email,
      preview: parsed.data.body.slice(0, 120)
    }
  });

  revalidatePath("/pipeline");
  revalidatePath(`/quotes/${parsed.data.quote_id}`);

  return {
    ok: true,
    comment: {
      ...(data as Omit<QuoteCommentRow, "author_name" | "author_email">),
      author_name: profile.full_name,
      author_email: profile.email
    }
  };
}

export async function editQuoteComment(input: z.infer<typeof editCommentSchema>): Promise<CommentActionResult> {
  const parsed = editCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const profile = await requireProfile();
  const supabase = await createClient();

  // Read the original so we can preserve the chain (revision_of) and the
  // original quote_id. We also block editing a soft-deleted comment.
  const { data: original, error: readError } = await supabase
    .from("quote_comments")
    .select("id,quote_id,author_id,body,deleted_at")
    .eq("id", parsed.data.comment_id)
    .maybeSingle();

  if (readError || !original) {
    return { ok: false, message: "Comment not found." };
  }
  if (original.deleted_at) {
    return { ok: false, message: "This comment was deleted." };
  }
  // Only the author can edit. Admins can use a separate moderation tool later.
  if (original.author_id && original.author_id !== profile.id) {
    return { ok: false, message: "Only the author can edit this comment." };
  }
  if (original.body === parsed.data.body) {
    // No-op edit. Pretend it succeeded so the UI just closes the editor.
    return {
      ok: true,
      comment: { ...(original as QuoteCommentRow), author_name: null, author_email: null, created_at: new Date().toISOString(), edited_at: null, revision_of: null }
    };
  }

  // Insert the new revision first so we don't leave an orphan history entry
  // if the mark-as-edited update later fails.
  const { data: revision, error: insertError } = await supabase
    .from("quote_comments")
    .insert({
      quote_id: original.quote_id,
      author_id: profile.id,
      body: parsed.data.body,
      revision_of: original.id
    })
    .select("id,quote_id,author_id,body,created_at,edited_at,revision_of,deleted_at")
    .single();

  if (insertError || !revision) {
    return {
      ok: false,
      message: friendlyCommentError(insertError?.message ?? "Could not save the edit.")
    };
  }

  await supabase
    .from("quote_comments")
    .update({ edited_at: new Date().toISOString() })
    .eq("id", original.id);

  await supabase.rpc("log_activity", {
    action_type: "quote_comment_edited",
    related_quote_id: original.quote_id,
    details: {
      original_comment_id: original.id,
      new_comment_id: revision.id,
      by: profile.email
    }
  });

  revalidatePath("/pipeline");
  revalidatePath(`/quotes/${original.quote_id}`);

  return {
    ok: true,
    comment: {
      ...(revision as Omit<QuoteCommentRow, "author_name" | "author_email">),
      author_name: profile.full_name,
      author_email: profile.email
    }
  };
}

export async function deleteQuoteComment(input: z.infer<typeof deleteCommentSchema>): Promise<CommentMutationResult> {
  const parsed = deleteCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: original, error: readError } = await supabase
    .from("quote_comments")
    .select("id,quote_id,author_id,deleted_at")
    .eq("id", parsed.data.comment_id)
    .maybeSingle();

  if (readError || !original) {
    return { ok: false, message: "Comment not found." };
  }
  if (original.deleted_at) {
    return { ok: true };
  }
  if (original.author_id && original.author_id !== profile.id) {
    return { ok: false, message: "Only the author can delete this comment." };
  }

  const { error: deleteError } = await supabase
    .from("quote_comments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id
    })
    .eq("id", original.id);

  if (deleteError) {
    return { ok: false, message: friendlyCommentError(deleteError.message) };
  }

  await supabase.rpc("log_activity", {
    action_type: "quote_comment_deleted",
    related_quote_id: original.quote_id,
    details: {
      comment_id: original.id,
      by: profile.email
    }
  });

  revalidatePath("/pipeline");
  revalidatePath(`/quotes/${original.quote_id}`);

  return { ok: true };
}

/**
 * Load comments for a quote in display order (newest-active first).
 * Superseded revisions are returned alongside their successor so the UI can
 * render history disclosures.
 */
export async function loadQuoteComments(quoteId: string): Promise<QuoteCommentRow[]> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_comments")
    .select(
      "id,quote_id,author_id,body,created_at,edited_at,revision_of,deleted_at,profiles!quote_comments_author_id_fkey(full_name,email)"
    )
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false });

  if (error) {
    // Tolerate a missing table — the UI shows a "run the migration" hint instead.
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    quote_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
    edited_at: string | null;
    revision_of: string | null;
    deleted_at: string | null;
    profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  }>).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
    return {
      id: row.id,
      quote_id: row.quote_id,
      author_id: row.author_id,
      author_name: profile?.full_name ?? null,
      author_email: profile?.email ?? null,
      body: row.body,
      created_at: row.created_at,
      edited_at: row.edited_at,
      revision_of: row.revision_of,
      deleted_at: row.deleted_at
    };
  });
}

function friendlyCommentError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("quote_comments") && (lower.includes("relation") || lower.includes("does not exist"))) {
    return "Comments table is missing. Run supabase/migrations/0012_quote_comments.sql in Supabase SQL Editor.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You do not have permission to write a comment.";
  }
  return message;
}
