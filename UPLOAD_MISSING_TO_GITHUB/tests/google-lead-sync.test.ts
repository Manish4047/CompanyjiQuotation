import { describe, expect, it } from "vitest";
import { mapLeadTrackerRow, parseLeadTrackerDate } from "@/lib/google/lead-sync";

describe("google lead sync mapping", () => {
  it("maps cold calling tracker rows into normalized lead intake payloads", () => {
    const mapped = mapLeadTrackerRow(
      "Cold Calling Leads",
      {
        company_name: "Acme Private Limited",
        director_name: "Ravi Kumar",
        cin: "U12345MH2024PTC000001",
        number: "9876543210",
        remark: "Asked for GST and ROC help",
        lead_quality_on_5: "4",
        email: "owner@acme.com",
        "1st_followup_date": "12/06/2026",
        lead_status: "Follow Up",
        quotation_send: "No"
      },
      2,
      "sheet-1"
    );

    expect(mapped?.source).toBe("google_sheet");
    expect(mapped?.leadSource).toBe("Cold Call");
    expect(mapped?.companyName).toBe("Acme Private Limited");
    expect(mapped?.phone).toBe("9876543210");
    expect(mapped?.status).toBe("follow_up");
    expect(mapped?.nextFollowUpAt).toBeTruthy();
    expect(mapped?.tags).toContain("google-sheet");
  });

  it("detects whatsapp and meta sheet tabs as different lead sources", () => {
    const whatsapp = mapLeadTrackerRow(
      "Whatsapp Leads CCFS",
      {
        company_name: "Beta LLP",
        director_name: "Neha Shah",
        number: "9988776655",
        status: "Working"
      },
      5,
      "sheet-1"
    );
    const meta = mapLeadTrackerRow(
      "META leads",
      {
        company_name: "Gamma Foods",
        director_name: "Aman Jain",
        number: "9123456780",
        timestamp: "2026-06-11T08:00:00.000Z",
        stage: "Qualified"
      },
      3,
      "sheet-1"
    );

    expect(whatsapp?.leadSource).toBe("WhatsApp");
    expect(meta?.leadSource).toBe("Meta");
    expect(meta?.sourceCreatedAt).toBe("2026-06-11T08:00:00.000Z");
  });

  it("parses common day-first follow-up dates", () => {
    expect(parseLeadTrackerDate("12/06/2026")).toBe("2026-06-12T09:00:00.000Z");
    expect(parseLeadTrackerDate("12-06-2026 3:45 PM")).toBe("2026-06-12T15:45:00.000Z");
  });
});
