import { NextResponse } from "next/server";
import { ingestLeadSubmission, normalizeDirectLeadSubmission } from "@/lib/lead-ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!hasLeadIntakeAccess(request, payload)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestLeadSubmission(normalizeDirectLeadSubmission(payload));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Lead intake failed."
      },
      { status: 500 }
    );
  }
}

function hasLeadIntakeAccess(request: Request, payload: unknown) {
  const expectedSecret = process.env.LEAD_INTAKE_SECRET;
  if (!expectedSecret) return true;

  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  const auth = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-companyji-intake-secret");
  const bodySecret = typeof record?.secret === "string" ? record.secret : "";

  return auth === `Bearer ${expectedSecret}` || headerSecret === expectedSecret || bodySecret === expectedSecret;
}
