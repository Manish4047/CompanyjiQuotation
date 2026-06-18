import { normalizeCurrencyCode } from "@/lib/currency";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Locale-currency mapping: rendering INR with en-IN gives ₹1,00,000 (Indian
// grouping). Rendering USD with en-IN gives "US$50" which is awkward outside
// India. Pick the obvious locale per currency so amounts look native.
const currencyLocaleMap: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
  CAD: "en-CA",
  AUD: "en-AU"
};

export function formatCurrency(amount: number, currencyCode?: string | null) {
  const currency = normalizeCurrencyCode(currencyCode);
  const locale = currencyLocaleMap[currency] ?? "en-IN";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

export function maskMobile(mobile: string | null | undefined) {
  if (!mobile) return "";
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 6) return "******";
  // Mask against the *digits-only* version so symbols like "+", parentheses,
  // or hyphens in the source don't end up in the visible prefix/suffix.
  // Preserve a leading "+" if the user stored one.
  const leadingPlus = mobile.trim().startsWith("+") ? "+" : "";
  return `${leadingPlus}${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

export function normalizePhoneDigits(phone: string | null | undefined) {
  return String(phone ?? "").replace(/\D/g, "");
}

export function buildPhoneCallHref(phone: string | null | undefined) {
  const value = String(phone ?? "").trim();
  if (!value) return "";
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  return `tel:${value.startsWith("+") ? `+${digits}` : digits}`;
}

export function buildQuoteWhatsAppMessage(serviceNames: string | null | undefined) {
  const label = String(serviceNames ?? "").trim() || "the required service";
  return `I wish to start the process for "${label}". I will email you all the documents shortly. Can you call?`;
}

export function buildWhatsAppHref(phone: string | null | undefined, message: string) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return "";
  const text = message.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export type StatusPillTone = "green" | "black" | "amber" | "red" | "muted";

/**
 * Map a quote status to the StatusPill tone. Used everywhere a quote status is
 * rendered so positive/negative/in-flight states stay visually consistent.
 */
export function quoteStatusTone(status: string | null | undefined): StatusPillTone {
  switch (status) {
    case "accepted":
      return "green";
    case "lost":
    case "spam":
    case "superseded":
      return "red";
    case "expired":
    case "lost_nurture":
    case "dormant":
      return "amber";
    case "sent":
    case "viewed":
    case "negotiating":
    case "refresh_requested":
      return "black";
    case "draft":
    default:
      return "muted";
  }
}
