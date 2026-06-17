import { firstName, formatCurrency } from "@/lib/utils";

export const dripCampaignTypes = [
  { value: "service_based", label: "Service-based drip" },
  { value: "custom", label: "Custom drip" },
  { value: "one_time", label: "One-time follow-up" },
  { value: "reengagement", label: "Re-engagement" }
] as const;

export const dripTriggerTypes = [
  { value: "quote_sent", label: "Quotation sent" },
  { value: "quote_viewed_no_reply", label: "Viewed, no reply" },
  { value: "inactive_quote", label: "Inactive for X days" },
  { value: "manual", label: "Manual enrollment" }
] as const;

export const dripTemplateCategories = [
  "Quotation follow-up",
  "Reminder",
  "Re-engagement",
  "Premium lead",
  "Documents pending",
  "Relationship"
] as const;

export const dripVariableCatalog = [
  "{{lead_name}}",
  "{{company_name}}",
  "{{quotation_number}}",
  "{{selected_service}}",
  "{{quotation_amount}}",
  "{{salesperson_name}}",
  "{{validity_date}}",
  "{{recommended_plan}}"
] as const;

export type DripStepInput = {
  step_order: number;
  delay_amount: number;
  delay_unit: "hours" | "days";
  channel: "email" | "whatsapp" | "both";
  subject: string;
  message: string;
  whatsapp_template_key?: string;
  whatsapp_template_status?: "draft" | "submitted" | "approved" | "rejected";
  whatsapp_preview_text?: string;
};

export type DripCampaignMatchInput = {
  trigger_type: string;
  status: string;
  service_ids: string[] | null;
  require_all_services: boolean;
  min_quote_amount: number | null;
  max_quote_amount: number | null;
  inactivity_days: number | null;
};

export type QuoteMatchContext = {
  triggerType: string;
  quoteStatus: string;
  serviceIds: string[];
  totalAmount: number;
  inactiveDays?: number;
};

export type DripVariableContext = {
  clientName: string;
  companyName?: string | null;
  quoteNumber?: string | null;
  selectedService?: string | null;
  quoteAmount?: number | null;
  salespersonName?: string | null;
  validityDate?: string | null;
  recommendedPlan?: string | null;
};

export function campaignMatchesQuote(campaign: DripCampaignMatchInput, context: QuoteMatchContext) {
  if (campaign.trigger_type !== context.triggerType) return false;
  if (context.quoteStatus === "accepted" || context.quoteStatus === "spam" || context.quoteStatus === "lost") return false;
  if (typeof campaign.min_quote_amount === "number" && context.totalAmount < campaign.min_quote_amount) return false;
  if (typeof campaign.max_quote_amount === "number" && campaign.max_quote_amount > 0 && context.totalAmount > campaign.max_quote_amount) return false;
  if (typeof campaign.inactivity_days === "number" && typeof context.inactiveDays === "number" && context.inactiveDays < campaign.inactivity_days) return false;

  const campaignServiceIds = campaign.service_ids ?? [];
  if (!campaignServiceIds.length) return true;

  if (campaign.require_all_services) {
    return campaignServiceIds.every((serviceId) => context.serviceIds.includes(serviceId));
  }

  return campaignServiceIds.some((serviceId) => context.serviceIds.includes(serviceId));
}

export function renderDripTemplate(template: string, context: DripVariableContext) {
  const variables = {
    lead_name: firstName(context.clientName || "there"),
    company_name: context.companyName || context.clientName || "",
    quotation_number: context.quoteNumber || "",
    selected_service: context.selectedService || "",
    quotation_amount: typeof context.quoteAmount === "number" ? formatCurrency(context.quoteAmount) : "",
    salesperson_name: context.salespersonName || "Team Companyji",
    validity_date: context.validityDate || "",
    recommended_plan: context.recommendedPlan || ""
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: keyof typeof variables) => variables[key] ?? "");
}

export function getNextStep<T extends Pick<DripStepInput, "step_order">>(steps: T[], currentStep: number) {
  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
  return ordered.find((step) => step.step_order > currentStep) ?? null;
}

export function calculateStepSchedule(baseTime: string | Date, step: Pick<DripStepInput, "delay_amount" | "delay_unit">) {
  const scheduled = new Date(baseTime);
  if (step.delay_unit === "hours") {
    scheduled.setHours(scheduled.getHours() + step.delay_amount);
  } else {
    scheduled.setDate(scheduled.getDate() + step.delay_amount);
  }
  return scheduled.toISOString();
}

export function buildDripEmail({
  subject,
  message,
  footerLine,
  trackingPixelUrl
}: {
  subject: string;
  message: string;
  footerLine: string;
  trackingPixelUrl?: string | null;
}) {
  const escapedSubject = escapeHtml(subject);
  const escapedParagraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#2b2b2b;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return {
    htmlContent: `
      <div style="margin:0;background:#f4f4f4;padding:24px 0;font-family:Inter,Arial,sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6ebdc;">
          <tr>
            <td style="background:#000000;padding:20px 24px;">
              <div style="font-size:28px;font-weight:800;color:#a0ce4e;line-height:1;">Companyji</div>
              <div style="margin-top:6px;font-size:12px;font-weight:700;color:#a0ce4e;text-transform:uppercase;">Smart Business Solutions - Since 2009</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#111111;">${escapedSubject}</h2>
              ${escapedParagraphs}
              <div style="margin-top:24px;padding:14px 16px;border:1px solid #d9ded1;background:#fbfcf8;font-size:12px;line-height:1.6;color:#5b5b5b;">
                Reply to this email if you want us to pause or stop these follow-ups.
              </div>
              ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none;" />` : ""}
            </td>
          </tr>
          <tr>
            <td style="background:#000000;padding:16px 24px;font-size:11px;line-height:1.6;color:#c7c7c7;text-align:center;">
              ${escapeHtml(footerLine)}
            </td>
          </tr>
        </table>
      </div>
    `.trim(),
    textContent: `${subject}\n\n${message}\n\nReply to this email if you want us to pause or stop these follow-ups.\n\n${footerLine}`
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
