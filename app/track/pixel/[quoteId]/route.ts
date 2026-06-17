import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

export async function GET(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const url = new URL(_request.url);
  const emailEventId = url.searchParams.get("email_event_id");
  const dripEventId = url.searchParams.get("drip_event_id");

  try {
    // Atomic increment via the increment_quote_opens RPC (migration 0014).
    // Concurrent pixel fetches no longer lose a count. If the RPC isn't
    // installed yet (migration hasn't been run) we fall back to the legacy
    // read-modify-write path so tracking keeps working during rollout.
    const { error: rpcError } = await supabase.rpc("increment_quote_opens", {
      p_quote_id: quoteId,
      p_now: now
    });

    if (rpcError) {
      const lower = (rpcError.message ?? "").toLowerCase();
      const missingFunction =
        lower.includes("increment_quote_opens") ||
        lower.includes("function") ||
        lower.includes("schema cache");
      if (!missingFunction) {
        // Real failure — log so it's visible, but still serve the pixel.
        console.error("[pixel] increment_quote_opens failed:", rpcError);
      } else {
        const { data: quote } = await supabase
          .from("quotes")
          .select("id,status,open_count,first_opened")
          .eq("id", quoteId)
          .maybeSingle();

        if (quote) {
          await supabase
            .from("quotes")
            .update({
              open_count: Number(quote.open_count ?? 0) + 1,
              first_opened: quote.first_opened ?? now,
              last_opened: now,
              status: quote.status === "sent" ? "viewed" : quote.status
            })
            .eq("id", quoteId);
        }
      }
    }

    await supabase
      .from("email_events")
      .update({
        opened_at: now,
        status: "opened"
      })
      .match(emailEventId ? { id: emailEventId } : { quote_id: quoteId })
      .is("opened_at", null)
      .in("status", ["sent", "queued"]);

    if (dripEventId) {
      const { data: dripEvent } = await supabase
        .from("drip_events")
        .select("enrollment_id,campaign_id,step_id,quote_id,client_id,channel")
        .eq("id", dripEventId)
        .maybeSingle();

      if (dripEvent) {
        await supabase.from("drip_events").insert({
          enrollment_id: dripEvent.enrollment_id,
          campaign_id: dripEvent.campaign_id,
          step_id: dripEvent.step_id,
          quote_id: dripEvent.quote_id,
          client_id: dripEvent.client_id,
          channel: dripEvent.channel,
          event_type: "opened"
        });
      }
    }
  } catch {
    // Return the pixel even if tracking update fails.
  }

  return new NextResponse(PIXEL_GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    }
  });
}
