export const supportedCurrencyCodes = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] as const;

export type SupportedCurrencyCode = (typeof supportedCurrencyCodes)[number];

export const defaultCurrencyCode: SupportedCurrencyCode = "INR";

export const supportedCurrencyOptions: Array<{ code: SupportedCurrencyCode; label: string }> = [
  { code: "INR", label: "INR - Indian Rupee" },
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "AED", label: "AED - UAE Dirham" },
  { code: "SGD", label: "SGD - Singapore Dollar" },
  { code: "AUD", label: "AUD - Australian Dollar" },
  { code: "CAD", label: "CAD - Canadian Dollar" }
];

export function isSupportedCurrencyCode(value: string | null | undefined): value is SupportedCurrencyCode {
  return supportedCurrencyCodes.includes((value ?? "") as SupportedCurrencyCode);
}

export function normalizeCurrencyCode(value: string | null | undefined) {
  return isSupportedCurrencyCode(value) ? value : defaultCurrencyCode;
}
