import { describe, expect, it } from "vitest";
import { calculateStepSchedule, campaignMatchesQuote, renderDripTemplate } from "@/lib/drips";

describe("drip campaign rules", () => {
  it("matches a service-based drip when all required services are present", () => {
    const matches = campaignMatchesQuote(
      {
        trigger_type: "quote_sent",
        status: "active",
        service_ids: ["pvt", "gst"],
        require_all_services: true,
        min_quote_amount: 10000,
        max_quote_amount: null,
        inactivity_days: null
      },
      {
        triggerType: "quote_sent",
        quoteStatus: "sent",
        serviceIds: ["pvt", "gst"],
        totalAmount: 18000
      }
    );

    expect(matches).toBe(true);
  });

  it("renders personalization variables into drip templates", () => {
    const rendered = renderDripTemplate("Hi {{lead_name}}, quote {{quotation_number}} for {{selected_service}} is ready.", {
      clientName: "Sachin Sharma",
      quoteNumber: "Q-2026-0001",
      selectedService: "Private Limited Registration"
    });

    expect(rendered).toContain("Sachin");
    expect(rendered).toContain("Q-2026-0001");
    expect(rendered).toContain("Private Limited Registration");
  });

  it("schedules the next step from the base time", () => {
    const scheduled = calculateStepSchedule("2026-04-23T00:00:00.000Z", {
      delay_amount: 3,
      delay_unit: "days"
    });

    expect(scheduled).toBe("2026-04-26T00:00:00.000Z");
  });
});
