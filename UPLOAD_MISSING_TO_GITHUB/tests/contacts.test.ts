import { describe, expect, it } from "vitest";
import { buildContactLookup, mergeContactRecord, matchesNormalizedContact } from "@/lib/contacts";

describe("contact matching and merge", () => {
  it("matches contacts even when mobile formatting differs", () => {
    const lookup = buildContactLookup({
      primary_email: "lead@example.com",
      primary_mobile: "+91 98765 43210"
    });

    const matches = matchesNormalizedContact(
      {
        primary_email: "lead@example.com",
        primary_mobile: "9876543210",
        historical_emails: [],
        historical_mobiles: []
      },
      lookup
    );

    expect(matches).toBe(true);
  });

  it("matches a lead when the saved WhatsApp number matches the incoming mobile", () => {
    const lookup = buildContactLookup({
      primary_mobile: "+91 99887 76655"
    });

    const matches = matchesNormalizedContact(
      {
        whatsapp_number: "9988776655",
        historical_emails: [],
        historical_mobiles: []
      },
      lookup
    );

    expect(matches).toBe(true);
  });

  it("keeps secondary email and mobile when merging a duplicate lead", () => {
    const merged = mergeContactRecord(
      {
        primary_email: "first@example.com",
        secondary_email: null,
        historical_emails: [],
        primary_mobile: "9876543210",
        secondary_mobile: null,
        historical_mobiles: [],
        whatsapp_number: "9876543210",
        whatsapp_consent: false
      },
      {
        primary_email: "owner@example.com",
        secondary_email: "first@example.com",
        primary_mobile: "+91 9988776655",
        secondary_mobile: "9876543210",
        whatsapp_consent: true
      }
    );

    expect(merged.primary_email).toBe("owner@example.com");
    expect(merged.secondary_email).toBe("first@example.com");
    expect(merged.primary_mobile).toBe("+91 9988776655");
    expect(merged.secondary_mobile).toBe("9876543210");
    expect(merged.whatsapp_consent).toBe(true);
  });
});
