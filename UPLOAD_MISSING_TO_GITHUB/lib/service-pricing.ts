export const servicePricingModes = ["fixed", "engagement_based", "retainership"] as const;
export type ServicePricingMode = (typeof servicePricingModes)[number];

export const retainershipCycles = ["monthly", "quarterly", "yearly"] as const;
export type RetainershipCycle = (typeof retainershipCycles)[number];

export function normalizeServicePricingMode(value: string | null | undefined): ServicePricingMode {
  return servicePricingModes.includes(value as ServicePricingMode) ? (value as ServicePricingMode) : "fixed";
}

export function normalizeRetainershipCycle(value: string | null | undefined): RetainershipCycle {
  return retainershipCycles.includes(value as RetainershipCycle) ? (value as RetainershipCycle) : "monthly";
}

export function formatRetainershipCycle(cycle: string | null | undefined) {
  const normalized = normalizeRetainershipCycle(cycle);
  if (normalized === "quarterly") return "Quarterly";
  if (normalized === "yearly") return "Yearly";
  return "Monthly";
}

export function formatRetainershipUnit(cycle: string | null | undefined) {
  const normalized = normalizeRetainershipCycle(cycle);
  if (normalized === "quarterly") return "quarter";
  if (normalized === "yearly") return "year";
  return "month";
}

export function buildRetainershipDescription(cycle: string | null | undefined) {
  const normalized = normalizeRetainershipCycle(cycle);
  if (normalized === "quarterly") return "Retainership billed quarterly.";
  if (normalized === "yearly") return "Retainership billed yearly.";
  return "Retainership billed monthly.";
}
