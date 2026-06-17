import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: reminders, error } = await supabase
      .from("lead_reminders")
      .select("id,lead_id,due_at,note,assigned_to,leads(company_name)")
      .eq("status", "pending")
      .is("notified_at", null)
      .lte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(error.message);
    }

    const rows = reminders ?? [];
    for (const reminder of rows) {
      await supabase.from("lead_reminders").update({ notified_at: now }).eq("id", reminder.id);
      await supabase.from("lead_comments").insert({
        lead_id: reminder.lead_id,
        author_id: reminder.assigned_to,
        body: `Reminder became due${reminder.note ? `: ${reminder.note}` : "."}`,
        is_system: true
      });
    }

    return NextResponse.json({
      ok: true,
      processed: rows.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Lead reminder cron failed."
      },
      { status: 500 }
    );
  }
}
