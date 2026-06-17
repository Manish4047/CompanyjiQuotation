import { NextResponse } from "next/server";
import {
  extractMetaLeadChanges,
  fetchMetaLeadSubmission,
  getMetaLeadAdsEnv,
  ingestLeadSubmission,
  normalizeMetaLeadSubmission
} from "@/lib/lead-ingest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const env = getMetaLeadAdsEnv();
  if (!env) {
    return new NextResponse("Meta lead ads webhook is not configured.", { status: 500 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const changes = extractMetaLeadChanges(payload);
    const results = [];

    for (const change of changes) {
      const leadPayload = await fetchMetaLeadSubmission(change.leadgenId);
      const result = await ingestLeadSubmission(normalizeMetaLeadSubmission(leadPayload, change));
      results.push(result);
    }

    return NextResponse.json({
      ok: true,
      created: results.filter((result) => result.created).length,
      duplicate: results.filter((result) => result.duplicate).length,
      processed: results.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Meta lead intake failed."
      },
      { status: 500 }
    );
  }
}
