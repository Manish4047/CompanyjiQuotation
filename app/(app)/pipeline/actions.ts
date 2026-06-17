"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { normalizeTagName } from "@/lib/pipeline-taxonomy";
import { createClient } from "@/lib/supabase/server";

const pipelineRowSchema = z.object({
  quoteId: z.string().uuid(),
  status: z.enum(["sent", "viewed", "negotiating", "accepted", "expired", "refresh_requested", "lost", "lost_nurture", "dormant", "spam", "superseded"]),
  folder_id: z.string().uuid().nullable().optional(),
  pipeline_category: z.string().trim().min(1).max(80),
  followup_date: z.string().trim().nullable().optional(),
  pipeline_comment: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([])
});

export type PipelineRowInput = z.input<typeof pipelineRowSchema>;

export async function savePipelineRow(input: PipelineRowInput) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const parsed = pipelineRowSchema.parse({
    ...input,
    tags: dedupeTags(input.tags ?? [])
  });

  const { data, error } = await supabase
    .from("quotes")
    .update({
      status: parsed.status,
      folder_id: parsed.folder_id || null,
      pipeline_category: parsed.pipeline_category || "General",
      followup_date: parsed.followup_date || null,
      pipeline_comment: parsed.pipeline_comment || "",
      tags: parsed.tags
    })
    .eq("id", parsed.quoteId)
    .select("id,quote_id_formatted,client_id,status,folder_id,pipeline_category,followup_date,tags")
    .single();

  if (error || !data) {
    return {
      ok: false,
      message: friendlyPipelineSaveError(error?.message ?? "Could not save pipeline changes.")
    };
  }

  await supabase.rpc("log_activity", {
    action_type: "quote_pipeline_updated",
    related_client_id: data.client_id,
    related_quote_id: data.id,
    details: {
      quote_id_formatted: data.quote_id_formatted,
      status: data.status,
      folder_id: data.folder_id,
      pipeline_category: data.pipeline_category,
      followup_date: data.followup_date,
      tags: data.tags,
      by: profile.email
    }
  });

  revalidatePath("/pipeline");
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${data.id}`);
  revalidatePath("/campaigns");

  return { ok: true };
}

function dedupeTags(tags: string[]) {
  return [...new Set(tags.map((tag) => normalizeTagName(tag)).filter(Boolean))];
}

function friendlyPipelineSaveError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("folder_id") || lower.includes("quote_folders") || lower.includes("pipeline_tags")) {
    return "Pipeline folders or tags are missing in the database. Run migration 0006 in Supabase SQL Editor.";
  }
  if (lower.includes("pipeline_category") || lower.includes("followup_date") || lower.includes("pipeline_comment")) {
    return "Pipeline fields are missing in the database. Run migration 0005 and 0006 in Supabase SQL Editor.";
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("policy")) {
    return "You do not have permission to update this lead from the pipeline.";
  }
  return message;
}
