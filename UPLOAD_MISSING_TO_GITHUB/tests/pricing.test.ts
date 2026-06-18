import { describe, expect, it } from "vitest";
import { calculateQuotePricing, calculateQuotePricingWithAdjustments } from "@/lib/pricing";

const services = [
  {
    id: "pvt",
    name: "Private Limited Registration",
    prepaid_fee: 7999,
    postpaid_fee: 9999,
    state_variations_apply: true
  },
  {
    id: "gst",
    name: "GST Registration",
    prepaid_fee: 2499,
    postpaid_fee: 3499,
    state_variations_apply: false
  }
];

describe("calculateQuotePricing", () => {
  it("uses postpaid fees and state surcharge when selected services require it", () => {
    const result = calculateQuotePricing({
      services,
      plan: "postpaid",
      stateSurcharge: 10000,
      addons: [{ description: "Additional director", amount: 2500 }]
    });

    expect(result).toEqual({
      subtotal: 13498,
      stateVariationAdd: 10000,
      addonTotal: 2500,
      otherFeeTotal: 0,
      totalAmount: 25998
    });
  });

  it("does not apply state surcharge when no selected service requires it", () => {
    const result = calculateQuotePricing({
      services: [services[1]],
      plan: "prepaid",
      stateSurcharge: 10000,
      addons: []
    });

    expect(result.totalAmount).toBe(2499);
  });

  it("applies discount before GST and allows GST on an editable base", () => {
    const result = calculateQuotePricingWithAdjustments({
      services: [services[0]],
      plan: "postpaid",
      stateSurcharge: 0,
      addons: [{ description: "Stamp paper", amount: 1000 }],
      discountAmount: 999,
      gstRatePercent: 18,
      gstBaseAmount: 5000
    });

    expect(result.totalBeforeGst).toBe(10000);
    expect(result.gstAmount).toBe(900);
    expect(result.totalAmount).toBe(10900);
  });

  it("allows signed other fees for government fees or extra discount", () => {
    const result = calculateQuotePricingWithAdjustments({
      services: [services[0]],
      plan: "prepaid",
      stateSurcharge: 0,
      addons: [],
      otherFees: [
        { description: "Government fee", amount: 1000 },
        { description: "Extra discount", amount: -500 }
      ]
    });

    expect(result.otherFeeTotal).toBe(500);
    expect(result.totalAmount).toBe(8499);
  });
});
