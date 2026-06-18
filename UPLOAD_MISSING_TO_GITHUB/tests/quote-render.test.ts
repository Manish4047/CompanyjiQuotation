import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type QuoteRenderData = {
  id: string;
  quote_id_formatted: string;
  validity_date: string;
  recommended_plan: string;
  show_service_breakup?: boolean;
  include_prepaid_plan: boolean;
  include_postpaid_plan: boolean;
  prepaid_total_amount: number;
  postpaid_total_amount: number;
  state_variation_add: number;
  addon_total: number;
  other_fee_total: number;
  discount_amount: number;
  gst_rate_percent: number;
  gst_amount: number;
  total_amount: number;
  required_documents_snapshot: string | null;
  service_fee_overrides?: unknown;
  document_items: unknown;
  custom_service_items: unknown;
  addon_items: unknown;
  other_fee_items: unknown;
  custom_note: string | null;
  clients: { name: string } | null;
  quotes_services?:
    | Array<{
        service_id?: string | null;
        fee_snapshot?: number | null;
        services:
          | {
              name: string;
              full_description?: string | null;
              prepaid_fee?: number | null;
              postpaid_fee?: number | null;
              prepaid_description?: string | null;
              postpaid_description?: string | null;
              first_installment?: number | null;
              first_trigger?: string | null;
              second_trigger?: string | null;
              timeline_typical?: string | null;
            }
          | null;
      }>
    | null;
};

let buildQuoteEmail: (typeof import("@/lib/quotes/render"))["buildQuoteEmail"];

beforeAll(async () => {
  ({ buildQuoteEmail } = await import("@/lib/quotes/render"));
});

function makeQuote(overrides: Partial<QuoteRenderData> = {}): QuoteRenderData {
  return {
    id: "quote-1",
    quote_id_formatted: "Q-2026-0001",
    validity_date: "2026-05-08",
    recommended_plan: "postpaid",
    include_prepaid_plan: true,
    include_postpaid_plan: true,
    prepaid_total_amount: 7999,
    postpaid_total_amount: 9999,
    state_variation_add: 0,
    addon_total: 0,
    other_fee_total: 0,
    discount_amount: 0,
    gst_rate_percent: 0,
    gst_amount: 0,
    total_amount: 9999,
    required_documents_snapshot: null,
    document_items: [],
    custom_service_items: [],
    addon_items: [],
    other_fee_items: [],
    custom_note: null,
    clients: { name: "Mayank Ventures" },
    quotes_services: [],
    ...overrides
  };
}

describe("quote email rendering", () => {
  it("renders footer call and WhatsApp links with a prefilled service message", () => {
    const email = buildQuoteEmail(
      makeQuote({
        quotes_services: [{ fee_snapshot: 9999, services: { name: "GST Registration" } }]
      })
    );

    expect(email.htmlContent).toContain('href="tel:+918647933633"');
    expect(email.htmlContent).toContain('href="tel:+919831013711"');
    expect(email.htmlContent).toContain("https://wa.me/919143688884?text=");
    expect(email.htmlContent).toContain(
      encodeURIComponent('I wish to start the process for "GST Registration". I will email you all the documents shortly. Can you call?')
    );
  });

  it("shows service quantity in the quoted service label and breakup", () => {
    const email = buildQuoteEmail(
      makeQuote({
        show_service_breakup: true,
        prepaid_total_amount: 15998,
        postpaid_total_amount: 19998,
        total_amount: 19998,
        service_fee_overrides: {
          "service-1": {
            prepaid_fee: 7999,
            postpaid_fee: 9999,
            first_installment: 4999,
            quantity: 2
          }
        },
        quotes_services: [
          {
            service_id: "service-1",
            fee_snapshot: 9999,
            services: {
              name: "Private Limited Registration",
              full_description: "Full incorporation support.",
              prepaid_fee: 7999,
              postpaid_fee: 9999,
              first_installment: 4999
            }
          }
        ]
      })
    );

    expect(email.htmlContent).toContain("Private Limited Registration (2 Units)");
    expect(email.htmlContent).toContain(">Qty<");
    expect(email.htmlContent).toContain("2 Units");
    expect(email.htmlContent).toContain("19,998");
  });
});

describe("quote email subject", () => {
  it("uses the single service name when only one service is quoted", () => {
    const email = buildQuoteEmail(
      makeQuote({
        quotes_services: [{ fee_snapshot: 9999, services: { name: "Private Limited Registration" } }]
      })
    );

    expect(email.subject).toBe("Quotation #Q-2026-0001 for Private Limited Registration - Mayank Ventures");
  });

  it("uses the highest-fee service as the main service when multiple services are quoted", () => {
    const email = buildQuoteEmail(
      makeQuote({
        quotes_services: [
          { fee_snapshot: 2500, services: { name: "GST Registration" } },
          { fee_snapshot: 9999, services: { name: "Private Limited Registration" } }
        ]
      })
    );

    expect(email.subject).toBe(
      "Quotation #Q-2026-0001 for Private Limited Registration and Related Compliance Services - Mayank Ventures"
    );
  });

  it("renders service description, timeline, and postpaid milestones in the quote body", () => {
    const email = buildQuoteEmail(
      makeQuote({
        quotes_services: [
          {
            service_id: "service-1",
            fee_snapshot: 9999,
            services: {
              name: "Private Limited Registration",
              full_description: "Full incorporation support from name application to certificate.",
              prepaid_fee: 7999,
              postpaid_fee: 9999,
              prepaid_description: "Full payment upfront.",
              postpaid_description: "Pay in milestones after work moves forward.",
              first_installment: 4999,
              first_trigger: "After DSC is applied",
              second_trigger: "After Incorporation Certificate is issued",
              timeline_typical: "10-20 working days"
            }
          }
        ]
      })
    );

    expect(email.htmlContent).toContain("Full incorporation support from name application to certificate.");
    expect(email.htmlContent).toContain("Typical timeline:");
    expect(email.htmlContent).toContain("10-20 working days");
    expect(email.htmlContent).toContain("First installment:");
    expect(email.htmlContent).toContain("After DSC is applied");
    expect(email.htmlContent).toContain("Second installment:");
    expect(email.htmlContent).toContain("After Incorporation Certificate is issued");
  });

  it("uses the quote-level first installment override and auto-calculates the second installment", () => {
    const email = buildQuoteEmail(
      makeQuote({
        service_fee_overrides: {
          "service-1": {
            prepaid_fee: 7999,
            postpaid_fee: 9999,
            first_installment: 6500
          }
        },
        quotes_services: [
          {
            service_id: "service-1",
            fee_snapshot: 9999,
            services: {
              name: "Private Limited Registration",
              full_description: "Full incorporation support.",
              prepaid_fee: 7999,
              postpaid_fee: 9999,
              first_installment: 4999,
              first_trigger: "After DSC is applied",
              second_trigger: "After Incorporation Certificate is issued"
            }
          }
        ]
      })
    );

    expect(email.htmlContent).toContain("6,500");
    expect(email.htmlContent).toContain("3,499");
  });

  it("applies quote discount to the remaining postpaid installment", () => {
    const email = buildQuoteEmail(
      makeQuote({
        discount_amount: 1000,
        postpaid_total_amount: 8999,
        total_amount: 8999,
        quotes_services: [
          {
            service_id: "service-1",
            fee_snapshot: 9999,
            services: {
              name: "Private Limited Registration",
              full_description: "Full incorporation support.",
              prepaid_fee: 7999,
              postpaid_fee: 9999,
              first_installment: 4999,
              first_trigger: "After DSC is applied",
              second_trigger: "After Incorporation Certificate is issued"
            }
          }
        ]
      })
    );

    expect(email.htmlContent).toContain("4,999");
    expect(email.htmlContent).toContain("4,000");
  });
});
