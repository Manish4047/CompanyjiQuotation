export type QuotePlan = "prepaid" | "postpaid" | "not_yet_chosen";

export type PriceableService = {
  id: string;
  name: string;
  prepaid_fee: number;
  postpaid_fee: number;
  state_variations_apply: boolean;
  quantity?: number;
};

export type QuoteAddon = {
  description: string;
  amount: number;
};

export type QuoteFeeItem = QuoteAddon;

export type CustomServiceItem = {
  name: string;
  description?: string;
  prepaid_fee: number;
  postpaid_fee: number;
  required_documents?: string;
};

export type QuotePricingInput = {
  services: PriceableService[];
  plan: QuotePlan;
  stateSurcharge: number;
  addons: QuoteAddon[];
  otherFees?: QuoteFeeItem[];
};

export type QuotePricingResult = {
  subtotal: number;
  stateVariationAdd: number;
  addonTotal: number;
  otherFeeTotal: number;
  totalAmount: number;
};

export type QuotePricingWithAdjustmentsResult = QuotePricingResult & {
  discountAmount: number;
  totalBeforeGst: number;
  gstRatePercent: number;
  gstBaseAmount: number;
  gstAmount: number;
};

export type TwoPlanPricingResult = {
  prepaid: QuotePricingResult;
  postpaid: QuotePricingResult;
};

export function calculateQuotePricing(input: QuotePricingInput): QuotePricingResult {
  const subtotal = input.services.reduce((sum, service) => {
    const quantity = safeQuantity(service.quantity);
    if (input.plan === "postpaid") return sum + safeAmount(service.postpaid_fee) * quantity;
    if (input.plan === "prepaid") return sum + safeAmount(service.prepaid_fee) * quantity;
    return sum + Math.max(safeAmount(service.prepaid_fee), safeAmount(service.postpaid_fee)) * quantity;
  }, 0);

  const stateVariationApplies = input.services.some((service) => service.state_variations_apply);
  const stateVariationAdd = stateVariationApplies ? safeAmount(input.stateSurcharge) : 0;
  const addonTotal = input.addons.reduce((sum, addon) => sum + safeAmount(addon.amount), 0);
  const otherFeeTotal = (input.otherFees ?? []).reduce((sum, fee) => sum + signedAmount(fee.amount), 0);

  return {
    subtotal,
    stateVariationAdd,
    addonTotal,
    otherFeeTotal,
    totalAmount: subtotal + stateVariationAdd + addonTotal + otherFeeTotal
  };
}

export function calculateTwoPlanPricing(input: Omit<QuotePricingInput, "plan">): TwoPlanPricingResult {
  return {
    prepaid: calculateQuotePricing({ ...input, plan: "prepaid" }),
    postpaid: calculateQuotePricing({ ...input, plan: "postpaid" })
  };
}

export function calculateQuotePricingWithAdjustments(
  input: QuotePricingInput & {
    discountAmount?: number;
    gstRatePercent?: number;
    gstBaseAmount?: number | null;
  }
): QuotePricingWithAdjustmentsResult {
  const base = calculateQuotePricing(input);
  const discountAmount = Math.min(safeAmount(input.discountAmount ?? 0), Math.max(0, base.totalAmount));
  const totalBeforeGst = Math.max(0, base.totalAmount - discountAmount);
  const gstRatePercent = Math.max(0, Number(input.gstRatePercent ?? 0));
  const gstBaseAmount =
    input.gstBaseAmount === null || input.gstBaseAmount === undefined
      ? totalBeforeGst
      : Math.max(0, Math.round(Number(input.gstBaseAmount) || 0));
  const gstAmount = Math.round((gstBaseAmount * gstRatePercent) / 100);

  return {
    ...base,
    discountAmount,
    totalBeforeGst,
    gstRatePercent,
    gstBaseAmount,
    gstAmount,
    totalAmount: totalBeforeGst + gstAmount
  };
}

export function calculateTwoPlanPricingWithAdjustments(
  input: Omit<QuotePricingInput, "plan"> & {
    discountAmount?: number;
    gstRatePercent?: number;
    gstBaseAmount?: number | null;
  }
) {
  return {
    prepaid: calculateQuotePricingWithAdjustments({ ...input, plan: "prepaid" }),
    postpaid: calculateQuotePricingWithAdjustments({ ...input, plan: "postpaid" })
  };
}

function safeAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function signedAmount(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function safeQuantity(value: number | undefined) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? Math.max(1, Math.round(quantity)) : 1;
}
