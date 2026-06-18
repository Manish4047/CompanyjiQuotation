export type QuoteFooterSettings = {
  assistanceLabel: string;
  assistancePhone: string;
  consultancyLabel: string;
  consultancyPhone: string;
  whatsappLabel: string;
  whatsappPhone: string;
  footerLine: string;
};

export const defaultQuoteFooterSettings: QuoteFooterSettings = {
  assistanceLabel: "Assistance",
  assistancePhone: "+91 86479 33633",
  consultancyLabel: "Consultancy",
  consultancyPhone: "+91 98310 13711",
  whatsappLabel: "WhatsApp",
  whatsappPhone: "+91 91436 88884",
  footerLine: "Companyji - Smart Business Solutions - Kolkata"
};

export type QuotePreviewCopy = {
  greeting: string;
  validity: string;
  investmentNote: string;
  includedNote: string;
  refundPolicy: string;
  whoWeAre: string;
  whoWeAreSubtext: string;
  signatureQuestion: string;
};

export const defaultQuotePreviewCopy: QuotePreviewCopy = {
  greeting: "Thank you for reaching out. As discussed, here is our quotation for",
  validity:
    "This quotation is valid for 15 days. Government fees occasionally change. If they do before you decide, we will send you an updated quote and tell you exactly what changed.",
  investmentNote: "Same work. Pick whichever feels right.",
  includedNote: "Everything required, in one package.",
  refundPolicy:
    "Postpaid: No advance, so no refund question. Prepaid: 100% refund if we have not started. Once we begin, no refund. That is our entire policy. No fine print.",
  whoWeAre:
    "Since 2009, Companyji has helped 5,000+ entrepreneurs and businesses handle the side of business that usually slows people down. We keep the process simple, move quickly, and give clients the kind of guidance that actually helps them move forward.",
  whoWeAreSubtext: "",
  signatureQuestion: "Questions? Reply to this email, or message us on WhatsApp."
};

export function parseQuoteFooterSettings(value: unknown): QuoteFooterSettings {
  if (!value || typeof value !== "object") return defaultQuoteFooterSettings;
  const record = value as Partial<Record<keyof QuoteFooterSettings, unknown>>;

  return {
    assistanceLabel: stringOrDefault(record.assistanceLabel, defaultQuoteFooterSettings.assistanceLabel),
    assistancePhone: stringOrDefault(record.assistancePhone, defaultQuoteFooterSettings.assistancePhone),
    consultancyLabel: stringOrDefault(record.consultancyLabel, defaultQuoteFooterSettings.consultancyLabel),
    consultancyPhone: stringOrDefault(record.consultancyPhone, defaultQuoteFooterSettings.consultancyPhone),
    whatsappLabel: stringOrDefault(record.whatsappLabel, defaultQuoteFooterSettings.whatsappLabel),
    whatsappPhone: stringOrDefault(record.whatsappPhone, defaultQuoteFooterSettings.whatsappPhone),
    footerLine: stringOrDefault(record.footerLine, defaultQuoteFooterSettings.footerLine)
  };
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}
