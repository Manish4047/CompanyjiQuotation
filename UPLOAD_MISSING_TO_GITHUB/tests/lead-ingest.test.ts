import { describe, expect, it } from "vitest";
import {
  buildGoogleFormAnswerMap,
  extractMetaLeadChanges,
  leadIntakeSourceLabel,
  normalizeGoogleFormSubmission,
  normalizeMetaLeadSubmission
} from "@/lib/lead-ingest";

describe("lead ingest helpers", () => {
  it("builds a normalized Google Form answer map", () => {
    const answers = buildGoogleFormAnswerMap({
      "Company Name": "Acme Private Limited",
      Phone_Number: "+91 98765 43210",
      Email: "owner@acme.com"
    });

    expect(answers.get("company name")).toEqual(["Acme Private Limited"]);
    expect(answers.get("phone number")).toEqual(["+91 98765 43210"]);
    expect(answers.get("email")).toEqual(["owner@acme.com"]);
  });

  it("maps a Google Form payload into a lead intake record", () => {
    const lead = normalizeGoogleFormSubmission({
      form_name: "Lead Capture",
      form_id: "form-1",
      response_id: "resp-9",
      submitted_at: "2026-06-09T10:00:00.000Z",
      answers: {
        "Company Name": "Acme Private Limited",
        "Full Name": "Ravi Kumar",
        Phone: "9876543210",
        Email: "owner@acme.com",
        Requirement: "Need GST registration"
      }
    });

    expect(lead.source).toBe("google_form");
    expect(lead.companyName).toBe("Acme Private Limited");
    expect(lead.contactName).toBe("Ravi Kumar");
    expect(lead.externalId).toBe("form-1:resp-9");
    expect(lead.remarks).toContain("Requirement");
  });

  it("extracts Meta leadgen changes and normalizes lead field data", () => {
    const changes = extractMetaLeadChanges({
      entry: [
        {
          changes: [
            {
              field: "leadgen",
              value: {
                ad_id: "ad-1",
                created_time: "2026-06-09T09:00:00.000Z",
                form_id: "form-22",
                leadgen_id: "lead-55",
                page_id: "page-9"
              }
            }
          ]
        }
      ]
    });

    expect(changes).toHaveLength(1);
    const lead = normalizeMetaLeadSubmission(
      {
        created_time: "2026-06-09T09:00:00.000Z",
        field_data: [
          { name: "company_name", values: ["Acme LLP"] },
          { name: "full_name", values: ["Ravi Kumar"] },
          { name: "phone_number", values: ["+91 99887 76655"] },
          { name: "email", values: ["hello@acme.com"] },
          { name: "service_needed", values: ["Trademark filing"] }
        ],
        form_id: "form-22"
      },
      changes[0]
    );

    expect(lead.source).toBe("meta_lead_ads");
    expect(lead.companyName).toBe("Acme LLP");
    expect(lead.phone).toBe("+91 99887 76655");
    expect(lead.externalId).toBe("lead-55");
    expect(lead.remarks).toContain("Service Needed");
  });

  it("returns human labels for intake sources", () => {
    expect(leadIntakeSourceLabel("meta_lead_ads")).toBe("Meta");
    expect(leadIntakeSourceLabel("google_form")).toBe("Google Form");
    expect(leadIntakeSourceLabel("whatsapp_inbox")).toBe("WhatsApp");
  });
});
