import { describe, expect, it } from "vitest";
import { canAccessConversationRecord, canAccessLeadRecord, leadFeatureWarningFromError, leadStatusLabel, splitLeadTags } from "@/lib/leads";

describe("lead helpers", () => {
  it("lets managers and admins access any lead", () => {
    expect(canAccessLeadRecord({ id: "user-1", role: "manager" }, { assigned_to: null, created_by: null })).toBe(true);
    expect(canAccessLeadRecord({ id: "user-1", role: "admin" }, { assigned_to: "user-2", created_by: "user-3" })).toBe(true);
  });

  it("limits agents to assigned or self-created leads", () => {
    expect(canAccessLeadRecord({ id: "user-1", role: "sales" }, { assigned_to: "user-1", created_by: null })).toBe(true);
    expect(canAccessLeadRecord({ id: "user-1", role: "executive" }, { assigned_to: null, created_by: "user-1" })).toBe(true);
    expect(canAccessLeadRecord({ id: "user-1", role: "sales" }, { assigned_to: "user-2", created_by: "user-3" })).toBe(false);
  });

  it("checks conversation visibility through direct or linked lead ownership", () => {
    expect(
      canAccessConversationRecord(
        { id: "user-1", role: "sales" },
        { assigned_to: null, created_by: null, lead_assigned_to: "user-1", lead_created_by: null }
      )
    ).toBe(true);

    expect(
      canAccessConversationRecord(
        { id: "user-1", role: "sales" },
        { assigned_to: "user-2", created_by: null, lead_assigned_to: null, lead_created_by: null }
      )
    ).toBe(false);
  });

  it("normalizes labels and tags", () => {
    expect(leadStatusLabel("quotation_sent")).toBe("In Quote Pipeline");
    expect(splitLeadTags(" hot, june , strike-off,, ")).toEqual(["hot", "june", "strike-off"]);
  });

  it("detects missing migration errors", () => {
    expect(leadFeatureWarningFromError(new Error('relation "public.leads" does not exist'))).toMatch("0015_leads_crm_v1.sql");
    expect(leadFeatureWarningFromError(new Error('relation "public.lead_ingest_events" does not exist'))).toMatch("0016_lead_intake_pipeline.sql");
  });
});
