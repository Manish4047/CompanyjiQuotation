import "server-only";

import {
  getDocumentBulletLabels,
  parseStructuredDocumentText,
  renderStructuredDocumentInlineHtml,
  renderStructuredDocumentInlineText,
  type StructuredDocumentLine
} from "@/lib/document-format";
import { normalizeCurrencyCode } from "@/lib/currency";
import { applyQuoteDiscountToInstallments } from "@/lib/quotes/installments";
import { renderRichTextHtml, renderRichTextPlain } from "@/lib/rich-text";
import { formatRetainershipCycle, formatRetainershipUnit, normalizeRetainershipCycle } from "@/lib/service-pricing";
import { defaultQuoteFooterSettings, parseQuoteFooterSettings, type QuoteFooterSettings } from "@/lib/settings";
import { buildPhoneCallHref, buildQuoteWhatsAppMessage, buildWhatsAppHref, firstName, formatCurrency, formatDate } from "@/lib/utils";

export type StoredQuoteDocumentItem = {
  id?: string;
  label: string;
  kind?: StructuredDocumentLine["kind"];
  serviceName?: string;
};

export type StoredQuoteServiceItem = {
  name: string;
  pricing_mode?: "fixed" | "engagement_based" | "retainership";
  quantity?: number;
  unit_label?: "units" | "year" | "nos";
  prepaid_fee?: number;
  postpaid_fee?: number;
  retainership_fee?: number;
  retainership_cycle?: string;
  description?: string;
  prepaid_description?: string;
  postpaid_description?: string;
  timeline_typical?: string;
  first_installment?: number;
  first_trigger?: string;
  second_trigger?: string;
};

export type StoredAmountItem = {
  description: string;
  amount: number;
};

export type QuoteRenderData = {
  id: string;
  quote_id_formatted: string;
  currency_code?: string | null;
  validity_date: string;
  company_name_snapshot?: string | null;
  client_mobile_snapshot?: string | null;
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
    | {
        service_id?: string | null;
        fee_snapshot?: number | null;
        services:
          | {
              name: string;
              short_description?: string | null;
              full_description?: string | null;
              pricing_mode?: "fixed" | "engagement_based" | "retainership" | null;
              prepaid_fee?: number | null;
              postpaid_fee?: number | null;
              retainership_fee?: number | null;
              retainership_cycle?: string | null;
              prepaid_description?: string | null;
              postpaid_description?: string | null;
              inclusions?: string | null;
              first_installment?: number | null;
              first_trigger?: string | null;
              second_trigger?: string | null;
              timeline_typical?: string | null;
              extra_costs_clause?: string | null;
            }
          | null;
      }[]
    | null;
};

export type QuoteServiceDetail = {
  id: string;
  pricingMode: "fixed" | "engagement_based" | "retainership";
  name: string;
  quantity: number;
  unitLabel: "units" | "year" | "nos";
  prepaidFee: number;
  postpaidFee: number;
  retainershipFee: number;
  retainershipCycle: string;
  shortDescription: string;
  fullDescription: string;
  prepaidDescription: string;
  postpaidDescription: string;
  inclusions: string;
  timelineTypical: string;
  firstInstallment: number;
  secondInstallment: number;
  firstTrigger: string;
  secondTrigger: string;
  extraCostsClause: string;
};

export function buildQuoteEmail(
  quote: QuoteRenderData,
  footerSettingsInput?: unknown,
  options?: { trackingPixelUrl?: string | null }
) {
  const footer = parseQuoteFooterSettings(footerSettingsInput ?? defaultQuoteFooterSettings);
  const currencyCode = normalizeCurrencyCode(quote.currency_code);
  const clientName = quote.clients?.name ?? "there";
  const companyName = String(quote.company_name_snapshot ?? "").trim();
  const mobileNumber = String(quote.client_mobile_snapshot ?? "").trim();
  const serviceDetails = getQuoteServiceDetails(quote);
  const serviceNames = serviceDetails.map((service) => formatServiceLabel(service.name, service.quantity, service.unitLabel)).join(" + ");
  const subject = buildQuoteSubject(quote);
  const planLabel = quote.recommended_plan === "prepaid" ? "Prepaid" : "Postpaid";
  const recommendedTotal = quote.recommended_plan === "prepaid" ? quote.prepaid_total_amount : quote.postpaid_total_amount;
  const documentGroups = getDocumentGroups(quote);
  const addonItems = parseAmountItems(quote.addon_items);
  const otherFeeItems = parseAmountItems(quote.other_fee_items);

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f4;font-family:Inter,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f4;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #d9ded1;">
            <tr>
              <td style="background:#000;padding:24px;color:#fff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-size:24px;font-weight:900;"><span style="color:#a0ce4e;">Company</span>ji</div>
                      <div style="margin-top:4px;color:#a0ce4e;font-size:12px;font-weight:700;">India's #1 rated Startup Consultant</div>
                    </td>
                    <td align="right" style="vertical-align:top;font-size:12px;line-height:1.6;">
                      <div style="font-weight:900;color:#a0ce4e;">Quotation</div>
                      <div>${escapeHtml(quote.quote_id_formatted)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;">Dear ${escapeHtml(firstName(clientName))},</p>
                <p style="margin:0 0 18px;line-height:1.6;color:#555;">Thank you for asking us about ${escapeHtml(serviceNames || "the required service")}. Sharing the quotation below for your review.</p>
                ${renderClientIdentityHtml(companyName, mobileNumber)}

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border-left:4px solid #a0ce4e;background:#f9fbf3;">
                  <tr><td style="padding:16px;">
                    <div style="font-size:11px;font-weight:900;color:#6a912f;text-transform:uppercase;">What we will deliver</div>
                    <div style="margin-top:6px;font-size:22px;font-weight:900;">${escapeHtml(serviceNames || "Selected services")}</div>
                    ${
                      serviceDetails[0]?.shortDescription || serviceDetails[0]?.fullDescription
                        ? `<div style="margin-top:8px;color:#555;font-size:13px;line-height:1.6;">${renderRichTextHtml(
                            serviceDetails[0]?.shortDescription || serviceDetails[0]?.fullDescription || ""
                          )}</div>`
                        : ""
                    }
                    <div style="margin-top:6px;color:#555;font-size:13px;font-style:italic;">Valid until ${escapeHtml(formatDate(quote.validity_date))}. Government fees occasionally change; if they do, we will tell you exactly what changed.</div>
                  </td></tr>
                </table>

                <div style="margin-top:24px;">
                  <div style="font-size:11px;font-weight:900;color:#777;text-transform:uppercase;">01 - Professional Fees</div>
                  <h2 style="margin:6px 0 10px;font-size:28px;line-height:1.2;">${escapeHtml(
                    getPricingHeading(serviceDetails, quote.include_prepaid_plan, quote.include_postpaid_plan)
                  )}</h2>
                </div>
                ${renderPlanCards(quote, serviceDetails, planLabel, recommendedTotal, currencyCode)}
                ${quote.show_service_breakup ? renderServiceBreakupTable(serviceDetails, quote.include_prepaid_plan, quote.include_postpaid_plan, currencyCode) : ""}
                ${renderRetainershipTable(serviceDetails, currencyCode)}
                ${renderServiceTermTable(serviceDetails, quote.include_prepaid_plan, quote.include_postpaid_plan)}
                ${renderAmountRows(quote, addonItems, otherFeeItems, currencyCode)}
                ${renderInclusions(serviceDetails)}

                <div style="margin-top:24px;font-size:11px;font-weight:900;color:#777;text-transform:uppercase;">03 - What we need from you</div>
                ${renderDocumentGroups(documentGroups)}

                ${renderServiceDetails(serviceDetails, quote.include_postpaid_plan, currencyCode)}

                ${quote.custom_note ? `<div style="margin-top:18px;padding:14px;border:1px solid #e6ebdc;background:#fbfcf8;line-height:1.6;color:#444;">${formatMultiline(quote.custom_note)}</div>` : ""}

                <div style="margin-top:24px;font-size:11px;font-weight:900;color:#777;text-transform:uppercase;">05 - Refund policy</div>
                <div style="padding:14px;border:1px solid #e6ebdc;background:#f9f9f9;line-height:1.6;color:#444;">
                  Postpaid: No advance, so no refund question.<br />
                  Prepaid: 100% refund if we have not started. Once we begin, no refund.<br />
                  That is our entire policy. No fine print.
                </div>

                <div style="margin-top:24px;background:#000;padding:20px;text-align:center;color:#fff;">
                  <div style="font-size:11px;font-weight:900;color:#a0ce4e;text-transform:uppercase;">Who we are</div>
                  <p style="margin:12px 0 0;font-size:14px;line-height:1.7;">Since 2009, Companyji has helped 5,000+ entrepreneurs and businesses handle the side of business that usually slows people down. We keep the process simple, move quickly, and give clients the kind of guidance that actually helps them move forward.</p>
                </div>

                <p style="margin:24px 0 0;line-height:1.7;color:#444;">If this looks fine, you can reply with <strong>Accepted</strong>. If anything needs to change, reply with the change and we will update it clearly.</p>
                <p style="margin:18px 0 0;line-height:1.7;">Warm regards,<br /><strong>Smart Business Solutions - Companyji</strong></p>
              </td>
            </tr>
            ${renderFooter(footer, serviceNames)}
          </table>
          ${options?.trackingPixelUrl ? `<img src="${escapeHtml(options.trackingPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;outline:none;text-decoration:none;width:1px;height:1px;" />` : ""}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textContent = [
    `Dear ${firstName(clientName)},`,
    "",
    `Thank you for asking us about ${serviceNames || "the required service"}. Sharing the quotation below for your review.`,
    ...(companyName ? [`Company Name: ${companyName}`] : []),
    ...(mobileNumber ? [`Mobile Number: ${mobileNumber}`] : []),
    "",
    "What we will deliver:",
    serviceNames || "Selected services",
    `Valid until ${formatDate(quote.validity_date)}.`,
    "",
    "01 - Professional Fees",
    quote.include_prepaid_plan ? `Prepaid total: ${formatCurrency(quote.prepaid_total_amount, currencyCode)}` : "",
    quote.include_postpaid_plan ? `Postpaid total: ${formatCurrency(quote.postpaid_total_amount, currencyCode)}` : "",
    `Recommended: ${planLabel} (${formatCurrency(recommendedTotal, currencyCode)})`,
    quote.show_service_breakup ? "Service-wise price breakup:" : "",
    ...(quote.show_service_breakup
      ? serviceDetails
          .filter((service) => service.pricingMode !== "retainership")
          .map((service) =>
          [
            formatServiceLabel(service.name, service.quantity, service.unitLabel),
            `Qty ${formatUnitCount(service.quantity, service.unitLabel)}`,
            quote.include_prepaid_plan ? `Prepaid ${formatCurrency(service.prepaidFee, currencyCode)}` : "",
            quote.include_postpaid_plan ? `Postpaid ${formatCurrency(service.postpaidFee, currencyCode)}` : ""
          ]
            .filter(Boolean)
            .join(" | ")
          )
      : []),
    ...(
      serviceDetails.some((service) => service.pricingMode === "retainership")
        ? [
            "Retainership services:",
            ...serviceDetails
              .filter((service) => service.pricingMode === "retainership")
              .map(
                (service) =>
                  `${formatServiceLabel(service.name, service.quantity, service.unitLabel)} | ${formatRetainershipCycle(service.retainershipCycle)} | ${formatCurrency(service.retainershipFee, currencyCode)} recurring total`
              )
          ]
        : []
    ),
    quote.state_variation_add ? `State variation: ${formatCurrency(quote.state_variation_add, currencyCode)}` : "",
    quote.addon_total ? `Add-ons: ${formatCurrency(quote.addon_total, currencyCode)}` : "",
    quote.other_fee_total ? `Other fees / adjustments: ${formatCurrency(quote.other_fee_total, currencyCode)}` : "",
    quote.discount_amount ? `Discount: ${formatCurrency(quote.discount_amount, currencyCode)}` : "",
    quote.gst_amount ? `GST @ ${quote.gst_rate_percent}%: ${formatCurrency(quote.gst_amount, currencyCode)}` : "",
    `Total: ${formatCurrency(quote.total_amount, currencyCode)}`,
    "",
    "",
    "02 - What is included:",
    ...serviceDetails.flatMap((service) => [
      service.name,
      renderRichTextPlain(service.inclusions) || "",
      ""
    ]),
    "",
    "03 - What we need from you:",
    ...documentGroups.flatMap((group) => [group.title, ...renderDocumentTextLines(group.items)]),
    "",
    "04 - Service note and timeline:",
    ...serviceDetails.flatMap((service) => [
      formatServiceLabel(service.name, service.quantity, service.unitLabel),
      service.quantity > 1 ? `${formatUnitCount(service.quantity, service.unitLabel)} selected` : "",
      service.fullDescription || service.shortDescription
        ? `Note:\n${renderRichTextPlain(service.fullDescription || service.shortDescription)}`
        : "",
      service.timelineTypical ? `Typical timeline: ${service.timelineTypical}` : "",
      service.pricingMode === "retainership"
        ? `Retainership fee: ${formatCurrency(service.retainershipFee, currencyCode)} / ${formatRetainershipUnit(service.retainershipCycle)}`
        : "",
      quote.include_prepaid_plan && service.prepaidDescription ? `Prepaid terms: ${service.prepaidDescription}` : "",
      quote.include_postpaid_plan && service.postpaidDescription ? `Postpaid terms: ${service.postpaidDescription}` : "",
      quote.include_postpaid_plan && service.pricingMode !== "retainership" && service.firstInstallment
        ? `In case of Postpaid - First installment: ${formatCurrency(service.firstInstallment, currencyCode)}${service.firstTrigger ? ` - ${service.firstTrigger}` : ""}`
        : "",
      quote.include_postpaid_plan && service.pricingMode !== "retainership" && service.secondInstallment
        ? `In case of Postpaid - Second installment: ${formatCurrency(service.secondInstallment, currencyCode)}${service.secondTrigger ? ` - ${service.secondTrigger}` : ""}`
        : "",
      service.extraCostsClause ? `Note: ${service.extraCostsClause}` : "",
      ""
    ]),
    "05 - Refund policy:",
    "Postpaid: No advance, so no refund question.",
    "Prepaid: 100% refund if we have not started. Once we begin, no refund.",
    "That is our entire policy. No fine print.",
    "",
    "If this looks fine, reply with Accepted. If anything needs to change, reply with the change and we will update it clearly.",
    "",
    "Warm regards,",
    "Smart Business Solutions - Companyji",
    `${footer.assistanceLabel}: ${footer.assistancePhone}`,
    `${footer.whatsappLabel}: ${footer.whatsappPhone}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, htmlContent, textContent };
}

export function buildWhatsAppBrief(quote: QuoteRenderData) {
  const currencyCode = normalizeCurrencyCode(quote.currency_code);
  const clientName = quote.clients?.name ?? "there";
  const serviceNames = getQuoteServiceNames(quote);
  const recommendedTotal = quote.recommended_plan === "prepaid" ? quote.prepaid_total_amount : quote.postpaid_total_amount;
  const planLabel = quote.recommended_plan === "prepaid" ? "Prepaid" : "Postpaid";
  const documentGroups = getDocumentGroups(quote);
  const documents = documentGroups.flatMap((group) => getDocumentBulletLabels(group.items)).slice(0, 6);
  const moreDocuments = documentGroups.flatMap((group) => getDocumentBulletLabels(group.items)).length - documents.length;

  return [
    `Hi ${firstName(clientName)}, sharing Companyji quotation ${quote.quote_id_formatted}${serviceNames ? ` for ${serviceNames}` : ""}.`,
    quote.include_prepaid_plan ? `Prepaid: ${formatCurrency(quote.prepaid_total_amount, currencyCode)}` : "",
    quote.include_postpaid_plan ? `Postpaid: ${formatCurrency(quote.postpaid_total_amount, currencyCode)}` : "",
    `Recommended: ${planLabel} (${formatCurrency(recommendedTotal, currencyCode)})`,
    `Valid until ${formatDate(quote.validity_date)}.`,
    documents.length ? `Documents needed: ${documents.join(", ")}${moreDocuments > 0 ? `, and ${moreDocuments} more` : ""}.` : "",
    "If this looks fine, reply Accepted. If anything needs to change, message us and we will update it clearly."
  ]
    .filter(Boolean)
    .join("\n");
}

export function getQuoteServiceNames(quote: QuoteRenderData) {
  return getQuoteServiceDetails(quote)
    .map((service) => formatServiceLabel(service.name, service.quantity, service.unitLabel))
    .join(" + ");
}

export function getQuoteServiceDetails(quote: QuoteRenderData) {
  const serviceFeeOverrides = parseServiceFeeOverrides(quote.service_fee_overrides);
  const linkedServices =
    quote.quotes_services?.reduce<Array<QuoteServiceDetail & { sortOrder: number }>>((services, item, index) => {
      const service = item.services;
      const name = service?.name?.trim();
      if (!service || !name) return services;

      const pricingMode =
        service.pricing_mode === "retainership"
          ? "retainership"
          : service.pricing_mode === "engagement_based"
            ? "engagement_based"
            : "fixed";
      const override = item.service_id ? serviceFeeOverrides[item.service_id] : undefined;
      const quantity = Math.max(1, override?.quantity ?? 1);
      const unitLabel = normalizeUnitBasis(override?.unit_label);
      const retainershipFee =
        Math.max(
          0,
          override?.retainership_fee ??
            toNumber(service.retainership_fee) ??
            toNumber(service.postpaid_fee) ??
            toNumber(item.fee_snapshot) ??
            0
        );
      const prepaidFee = pricingMode === "retainership" ? retainershipFee : override?.prepaid_fee ?? toNumber(service.prepaid_fee) ?? 0;
      const postpaidFee =
        pricingMode === "retainership"
          ? retainershipFee
          : override?.postpaid_fee ?? toNumber(service.postpaid_fee) ?? toNumber(item.fee_snapshot) ?? 0;
      const firstInstallment =
        pricingMode === "retainership" ? 0 : Math.max(0, override?.first_installment ?? toNumber(service.first_installment) ?? 0);

      services.push({
        id: item.service_id ?? `linked-${index}-${name.toLowerCase()}`,
        pricingMode,
        name,
        quantity,
        unitLabel,
        prepaidFee: prepaidFee * quantity,
        postpaidFee: postpaidFee * quantity,
        retainershipFee: retainershipFee * quantity,
        retainershipCycle: normalizeRetainershipCycle(service.retainership_cycle),
        shortDescription: String(service.short_description ?? "").trim(),
        fullDescription: String(service.full_description ?? "").trim(),
        prepaidDescription: String(service.prepaid_description ?? "").trim(),
        postpaidDescription: String(service.postpaid_description ?? "").trim(),
        inclusions: String(service.inclusions ?? "").trim(),
        timelineTypical: String(service.timeline_typical ?? "").trim(),
        firstInstallment: firstInstallment * quantity,
        secondInstallment: pricingMode === "retainership" ? 0 : Math.max(0, postpaidFee - firstInstallment) * quantity,
        firstTrigger: String(service.first_trigger ?? "").trim(),
        secondTrigger: String(service.second_trigger ?? "").trim(),
        extraCostsClause: String(service.extra_costs_clause ?? "").trim(),
        sortOrder: index
      });
      return services;
    }, []) ?? [];

  const customServices = parseCustomServices(quote.custom_service_items).map((service, index) => {
    const prepaidFee = service.prepaid_fee ?? 0;
    const postpaidFee = service.postpaid_fee ?? 0;
    const firstInstallment = Math.max(0, service.first_installment ?? 0);
    return {
      id: `custom-${index}-${service.name.toLowerCase()}`,
      pricingMode: service.pricing_mode === "engagement_based" ? "engagement_based" : "fixed",
      name: service.name,
      quantity: Math.max(1, service.quantity ?? 1),
      unitLabel: normalizeUnitBasis(service.unit_label),
      prepaidFee,
      postpaidFee,
      retainershipFee: Math.max(prepaidFee, postpaidFee),
      retainershipCycle: normalizeRetainershipCycle(service.retainership_cycle),
      shortDescription: "",
      fullDescription: service.description?.trim() ?? "",
      prepaidDescription: service.prepaid_description?.trim() || "Full payment upfront.",
      postpaidDescription: service.postpaid_description?.trim() || "Payment after the agreed milestone.",
      inclusions: "",
      timelineTypical: service.timeline_typical?.trim() ?? "",
      firstInstallment,
      secondInstallment: Math.max(0, postpaidFee - firstInstallment),
      firstTrigger: service.first_trigger?.trim() ?? "",
      secondTrigger: service.second_trigger?.trim() ?? "",
      extraCostsClause: "",
      sortOrder: linkedServices.length + index
    } satisfies QuoteServiceDetail & { sortOrder: number };
  });

  const allServices = [...linkedServices, ...customServices];
  const discountedServices = applyQuoteDiscountToInstallments(
    allServices.filter((service) => service.pricingMode !== "retainership"),
    quote.discount_amount
  );
  const retainershipServices = allServices.filter((service) => service.pricingMode === "retainership");

  return [...discountedServices, ...retainershipServices]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...service }) => service);
}

export function getDocumentGroups(quote: QuoteRenderData) {
  const documentItems = parseDocumentItems(quote.document_items);
  if (documentItems.length) {
    const grouped = documentItems.reduce<Record<string, StructuredDocumentLine[]>>((groups, item) => {
      const groupName = item.serviceName || "Additional documents";
      groups[groupName] = [...(groups[groupName] ?? []), { kind: item.kind ?? "item", label: item.label }];
      return groups;
    }, {});

    return Object.entries(grouped).map(([title, items]) => ({ title, items }));
  }

  const fallbackItems = parseStructuredDocumentText(String(quote.required_documents_snapshot ?? ""));

  return fallbackItems.length ? [{ title: "Documents", items: fallbackItems }] : [];
}

function parseDocumentItems(value: unknown): StoredQuoteDocumentItem[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StoredQuoteDocumentItem[]>((items, item) => {
    if (!item || typeof item !== "object") return items;
    const record = item as Record<string, unknown>;
    const kind = record.kind === "heading" || record.kind === "break" ? record.kind : "item";
    const label = String(record.label ?? "").trim();
    if (!label && kind !== "break") return items;
    items.push({
      id: typeof record.id === "string" ? record.id : undefined,
      label,
      kind,
      serviceName: typeof record.serviceName === "string" ? record.serviceName : undefined
    });
    return items;
  }, []);
}

function parseCustomServices(value: unknown): StoredQuoteServiceItem[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StoredQuoteServiceItem[]>((items, item) => {
    if (!item || typeof item !== "object") return items;
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const quantity = Number(record.quantity ?? 1);
    if (!name) return items;
    items.push({
      name,
      quantity: Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : 1,
      prepaid_fee: toNumber(record.prepaid_fee),
      postpaid_fee: toNumber(record.postpaid_fee),
      description: typeof record.description === "string" ? record.description : undefined,
      prepaid_description: typeof record.prepaid_description === "string" ? record.prepaid_description : undefined,
      postpaid_description: typeof record.postpaid_description === "string" ? record.postpaid_description : undefined,
      timeline_typical: typeof record.timeline_typical === "string" ? record.timeline_typical : undefined,
      first_installment: toNumber(record.first_installment),
      first_trigger: typeof record.first_trigger === "string" ? record.first_trigger : undefined,
      second_trigger: typeof record.second_trigger === "string" ? record.second_trigger : undefined
    });
    return items;
  }, []);
}

function buildQuoteSubject(quote: QuoteRenderData) {
  const clientName = quote.clients?.name?.trim() || "Client";
  const services = getQuoteServiceEntries(quote);

  if (!services.length) {
    return `Quotation #${quote.quote_id_formatted} - ${clientName}`;
  }

  if (services.length === 1) {
    return `Quotation #${quote.quote_id_formatted} for ${services[0].name} - ${clientName}`;
  }

  const mainService =
    [...services].sort((left, right) => right.fee - left.fee || left.name.localeCompare(right.name))[0]?.name ?? services[0].name;

  return `Quotation #${quote.quote_id_formatted} for ${mainService} and Related Compliance Services - ${clientName}`;
}

function getQuoteServiceEntries(quote: QuoteRenderData) {
  return getQuoteServiceDetails(quote).map((service) => ({
    name: service.name,
    fee: Math.max(service.prepaidFee, service.postpaidFee, service.retainershipFee)
  }));
}

function parseAmountItems(value: unknown): StoredAmountItem[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<StoredAmountItem[]>((items, item) => {
    if (!item || typeof item !== "object") return items;
    const record = item as Record<string, unknown>;
    const description = String(record.description ?? "").trim();
    const amount = toNumber(record.amount) ?? 0;
    if (!description && amount === 0) return items;
    items.push({ description: description || "Adjustment", amount });
    return items;
  }, []);
}

function renderPlanCards(quote: QuoteRenderData, serviceDetails: QuoteServiceDetail[], planLabel: string, recommendedTotal: number, currencyCode: string) {
  const pricedServices = serviceDetails.filter((service) => service.pricingMode !== "retainership");
  if (!pricedServices.length) return "";

  const prepaidText =
    pricedServices.length === 1
      ? pricedServices[0]?.prepaidDescription || "Full payment upfront."
      : "Full payment upfront. Service-wise terms are shown below.";
  const postpaidText =
    pricedServices.length === 1
      ? pricedServices[0]?.postpaidDescription || "You pay after the agreed milestone."
      : "Pay after the agreed milestone. Service-wise terms and milestones are shown below.";

  const cards = [
    quote.include_prepaid_plan
      ? `<td style="padding:0 6px 12px 0;vertical-align:top;">
          <div style="border:1px solid #e6ebdc;padding:16px;">
            <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Prepaid${planLabel === "Prepaid" ? " - Recommended" : ""}</div>
            <div style="margin-top:8px;font-size:22px;font-weight:900;">${formatCurrency(quote.prepaid_total_amount, currencyCode)}</div>
            <div style="margin-top:8px;color:#555;font-size:13px;line-height:1.5;">${escapeHtml(prepaidText)}</div>
          </div>
        </td>`
      : "",
    quote.include_postpaid_plan
      ? `<td style="padding:0 0 12px 6px;vertical-align:top;">
          <div style="border:1px solid #a0ce4e;background:#f9fbf3;padding:16px;">
            <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Postpaid${planLabel === "Postpaid" ? " - Recommended" : ""}</div>
            <div style="margin-top:8px;font-size:22px;font-weight:900;">${formatCurrency(quote.postpaid_total_amount, currencyCode)}</div>
            <div style="margin-top:8px;color:#555;font-size:13px;line-height:1.5;">${escapeHtml(postpaidText)}</div>
          </div>
        </td>`
      : ""
  ].join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cards}</tr></table>
    <div style="margin-top:4px;color:#555;font-size:13px;">Recommended: <strong>${escapeHtml(planLabel)} - ${formatCurrency(recommendedTotal, currencyCode)}</strong></div>`;
}

function getPricingHeading(serviceDetails: QuoteServiceDetail[], includePrepaidPlan: boolean, includePostpaidPlan: boolean) {
  const hasPlanPricing = serviceDetails.some((service) => service.pricingMode !== "retainership");
  if (!hasPlanPricing) return "Retainership fees";
  if (includePrepaidPlan && includePostpaidPlan) return "Two ways to engage us";
  if (includePrepaidPlan) return "Prepaid professional fees";
  if (includePostpaidPlan) return "Postpaid professional fees";
  return "Professional fees";
}

function renderServiceBreakupTable(serviceDetails: QuoteServiceDetail[], showPrepaid: boolean, showPostpaid: boolean, currencyCode: string) {
  const pricedServices = serviceDetails.filter((service) => service.pricingMode !== "retainership");
  if (!pricedServices.length || (!showPrepaid && !showPostpaid)) return "";

  const headers = [
    "Service",
    "Qty",
    showPrepaid ? "Prepaid" : "",
    showPostpaid ? "Postpaid" : ""
  ]
    .filter(Boolean)
    .map(
      (header) =>
        `<th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">${escapeHtml(
          header
        )}</th>`
    )
    .join("");

  const rows = pricedServices
    .map((service) => {
      const values = [
        `<td style="border:1px solid #e6ebdc;padding:10px 12px;font-weight:900;">${escapeHtml(service.name)}</td>`,
        `<td style="border:1px solid #e6ebdc;padding:10px 12px;">${escapeHtml(formatUnitCount(service.quantity, service.unitLabel))}</td>`,
        showPrepaid ? `<td style="border:1px solid #e6ebdc;padding:10px 12px;">${formatCurrency(service.prepaidFee, currencyCode)}</td>` : "",
        showPostpaid ? `<td style="border:1px solid #e6ebdc;padding:10px 12px;">${formatCurrency(service.postpaidFee, currencyCode)}</td>` : ""
      ]
        .filter(Boolean)
        .join("");
      return `<tr>${values}</tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderRetainershipTable(serviceDetails: QuoteServiceDetail[], currencyCode: string) {
  const retainershipServices = serviceDetails.filter((service) => service.pricingMode === "retainership");
  if (!retainershipServices.length) return "";

  const rows = retainershipServices
    .map(
      (service) => `<tr>
        <td style="border:1px solid #e6ebdc;padding:10px 12px;font-weight:900;">${escapeHtml(service.name)}</td>
        <td style="border:1px solid #e6ebdc;padding:10px 12px;">${escapeHtml(formatUnitCount(service.quantity, service.unitLabel))}</td>
        <td style="border:1px solid #e6ebdc;padding:10px 12px;">${escapeHtml(formatRetainershipCycle(service.retainershipCycle))}</td>
        <td style="border:1px solid #e6ebdc;padding:10px 12px;">${formatCurrency(service.retainershipFee, currencyCode)}</td>
      </tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Retainership service</th>
        <th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Qty</th>
        <th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Billing cycle</th>
        <th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">Recurring total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderServiceTermTable(serviceDetails: QuoteServiceDetail[], showPrepaid: boolean, showPostpaid: boolean) {
  const pricedServices = serviceDetails.filter((service) => service.pricingMode !== "retainership");
  if (!pricedServices.length || (!showPrepaid && !showPostpaid)) return "";

  const hasAnyTerms = pricedServices.some((service) => {
    return (showPrepaid && service.prepaidDescription) || (showPostpaid && service.postpaidDescription);
  });

  if (!hasAnyTerms) return "";

  const headers = [
    "Service terms",
    showPrepaid ? "Prepaid" : "",
    showPostpaid ? "Postpaid" : ""
  ]
    .filter(Boolean)
    .map(
      (header) =>
        `<th style="border:1px solid #e6ebdc;background:#f9fbf3;padding:10px 12px;text-align:left;font-size:11px;font-weight:900;text-transform:uppercase;color:#555;">${escapeHtml(
          header
        )}</th>`
    )
    .join("");

  const rows = pricedServices
    .map((service) => {
      const values = [
        `<td style="border:1px solid #e6ebdc;padding:10px 12px;font-weight:900;">${escapeHtml(service.name)}</td>`,
        showPrepaid ? `<td style="border:1px solid #e6ebdc;padding:10px 12px;">${escapeHtml(service.prepaidDescription || "Full payment upfront.")}</td>` : "",
        showPostpaid ? `<td style="border:1px solid #e6ebdc;padding:10px 12px;">${escapeHtml(service.postpaidDescription || "Payment after the agreed milestone.")}</td>` : ""
      ]
        .filter(Boolean)
        .join("");
      return `<tr>${values}</tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderInclusions(serviceDetails: QuoteServiceDetail[]) {
  const servicesWithInclusions = serviceDetails.filter((service) => service.inclusions);
  if (!servicesWithInclusions.length) return "";

  return `<div style="margin-top:24px;">
    <div style="font-size:11px;font-weight:900;color:#777;text-transform:uppercase;">02 - What is included</div>
    ${servicesWithInclusions
      .map(
        (service) => `<div style="margin-top:12px;border:1px solid #e6ebdc;padding:14px;">
          <div style="font-size:14px;font-weight:900;color:#111;">${escapeHtml(service.name)}</div>
          <div style="margin-top:8px;color:#444;font-size:13px;line-height:1.6;">${renderRichTextHtml(service.inclusions)}</div>
        </div>`
      )
      .join("")}
  </div>`;
}

function renderAmountRows(quote: QuoteRenderData, addonItems: StoredAmountItem[], otherFeeItems: StoredAmountItem[], currencyCode: string) {
  const rows = [
    quote.state_variation_add ? amountRow("State variation", quote.state_variation_add, currencyCode) : "",
    ...addonItems.map((item) => amountRow(`Add-on - ${item.description}`, item.amount, currencyCode)),
    ...otherFeeItems.map((item) => amountRow(item.description, item.amount, currencyCode)),
    quote.discount_amount ? amountRow("Discount", -quote.discount_amount, currencyCode) : "",
    quote.gst_amount ? amountRow(`GST @ ${quote.gst_rate_percent}%`, quote.gst_amount, currencyCode) : "",
    amountRow("Total", quote.total_amount, currencyCode, true)
  ].join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border:1px solid #e6ebdc;">${rows}</table>`;
}

function renderServiceDetails(serviceDetails: QuoteServiceDetail[], showPostpaid: boolean, currencyCode: string) {
  if (!serviceDetails.length) return "";

  return `<div style="margin-top:20px;">
    <div style="font-size:11px;font-weight:900;color:#777;text-transform:uppercase;">04 - Service note and timeline</div>
    ${serviceDetails
      .map((service) => {
        const description = service.fullDescription || service.shortDescription;
        const milestoneLines = showPostpaid && service.pricingMode !== "retainership"
          ? [
              service.firstInstallment
                ? `In case of Postpaid - First installment: ${formatCurrency(service.firstInstallment, currencyCode)}${service.firstTrigger ? ` - ${escapeHtml(service.firstTrigger)}` : ""}`
                : "",
              service.secondInstallment
                ? `In case of Postpaid - Second installment: ${formatCurrency(service.secondInstallment, currencyCode)}${service.secondTrigger ? ` - ${escapeHtml(service.secondTrigger)}` : ""}`
                : ""
            ]
              .filter(Boolean)
              .join("<br />")
          : "";
        const retainershipLine =
          service.pricingMode === "retainership"
            ? `<div style="margin-top:8px;font-size:12px;color:#555;"><strong>Retainership fee:</strong> ${formatCurrency(service.retainershipFee, currencyCode)} / ${escapeHtml(
                formatRetainershipUnit(service.retainershipCycle)
              )}</div>`
            : "";

        return `<div style="margin-top:12px;border:1px solid #e6ebdc;background:#fbfcf8;padding:14px;">
          <div style="font-size:16px;font-weight:900;color:#111;">${escapeHtml(service.name)}</div>
          ${service.quantity > 1 ? `<div style="margin-top:4px;font-size:11px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;color:#777;">${escapeHtml(formatUnitCount(service.quantity, service.unitLabel))} selected</div>` : ""}
          ${description ? `<div style="margin-top:8px;color:#444;font-size:13px;line-height:1.6;"><strong>Note:</strong>${renderRichTextHtml(description)}</div>` : ""}
          ${service.timelineTypical ? `<div style="margin-top:8px;font-size:12px;color:#555;"><strong>Typical timeline:</strong> ${escapeHtml(service.timelineTypical)}</div>` : ""}
          ${retainershipLine}
          ${milestoneLines ? `<div style="margin-top:8px;font-size:12px;color:#555;line-height:1.7;">${milestoneLines}</div>` : ""}
          ${service.extraCostsClause ? `<div style="margin-top:8px;font-size:12px;color:#555;">${escapeHtml(service.extraCostsClause)}</div>` : ""}
        </div>`;
      })
      .join("")}
  </div>`;
}

function amountRow(label: string, amount: number, currencyCode: string, strong = false) {
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e6ebdc;color:#555;${strong ? "font-weight:900;color:#111;" : ""}">${escapeHtml(label)}</td>
    <td align="right" style="padding:10px 12px;border-bottom:1px solid #e6ebdc;font-weight:900;${strong ? "color:#111;" : ""}">${formatCurrency(amount, currencyCode)}</td>
  </tr>`;
}

function renderDocumentGroups(groups: { title: string; items: StructuredDocumentLine[] }[]) {
  if (!groups.length) {
    return `<div style="padding:14px;border:1px solid #e6ebdc;color:#555;">No document requirements were saved for this quote.</div>`;
  }

  return groups
    .map(
      (group) => `<div style="margin-bottom:12px;border:1px solid #e6ebdc;">
        <div style="background:#fbfcf8;padding:10px 12px;font-weight:900;">${escapeHtml(group.title)}</div>
        <div style="padding:12px;line-height:1.7;color:#444;">
          ${renderDocumentHtmlLines(group.items)}
        </div>
      </div>`
    )
    .join("");
}

function renderDocumentHtmlLines(items: StructuredDocumentLine[]) {
  return items
    .map((item) => {
      if (item.kind === "break") {
        return `<div style="height:10px;"></div>`;
      }
      if (item.kind === "heading") {
        return `<div style="margin:4px 0 6px;font-weight:900;color:#111;">${renderStructuredDocumentInlineHtml(item.label)}</div>`;
      }
      return `<div style="padding-left:16px;position:relative;"><span style="position:absolute;left:0;">&#8226;</span>${renderStructuredDocumentInlineHtml(item.label)}</div>`;
    })
    .join("");
}

function renderDocumentTextLines(items: StructuredDocumentLine[]) {
  return items.map((item) => {
    if (item.kind === "break") return "";
    if (item.kind === "heading") return renderStructuredDocumentInlineText(item.label);
    return `- ${renderStructuredDocumentInlineText(item.label)}`;
  });
}

function renderFooter(settings: QuoteFooterSettings, serviceNames: string) {
  const assistanceHref = buildPhoneCallHref(settings.assistancePhone);
  const consultancyHref = buildPhoneCallHref(settings.consultancyPhone);
  const whatsappHref = buildWhatsAppHref(settings.whatsappPhone, buildQuoteWhatsAppMessage(serviceNames));
  return `<tr>
    <td style="background:#000;padding:18px;color:#fff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size:12px;color:#aaa;">${escapeHtml(settings.assistanceLabel)}<br /><strong style="color:#a0ce4e;">${renderFooterPhoneLink(settings.assistancePhone, assistanceHref)}</strong></td>
          <td style="font-size:12px;color:#aaa;">${escapeHtml(settings.consultancyLabel)}<br /><strong style="color:#a0ce4e;">${renderFooterPhoneLink(settings.consultancyPhone, consultancyHref)}</strong></td>
          <td style="font-size:12px;color:#aaa;">${escapeHtml(settings.whatsappLabel)}<br /><strong style="color:#a0ce4e;">${renderFooterPhoneLink(settings.whatsappPhone, whatsappHref)}</strong></td>
        </tr>
      </table>
      <div style="margin-top:16px;text-align:center;font-size:10px;color:#888;text-transform:uppercase;">${escapeHtml(settings.footerLine)}</div>
    </td>
  </tr>`;
}

function renderFooterPhoneLink(label: string, href: string) {
  const text = escapeHtml(label);
  if (!href) return text;
  return `<a href="${escapeHtml(href)}" style="color:#a0ce4e;text-decoration:none;">${text}</a>`;
}

function renderClientIdentityHtml(companyName: string, mobileNumber: string) {
  if (!companyName && !mobileNumber) return "";

  return `<div style="margin:0 0 18px;padding:10px 12px;border:1px solid #e6ebdc;background:#fbfcf8;font-size:12px;line-height:1.7;color:#444;">
    ${companyName ? `<div><strong>Company Name:</strong> ${escapeHtml(companyName)}</div>` : ""}
    ${mobileNumber ? `<div><strong>Mobile Number:</strong> ${escapeHtml(mobileNumber)}</div>` : ""}
  </div>`;
}

function parseServiceFeeOverrides(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, { prepaid_fee?: number; postpaid_fee?: number; first_installment?: number; retainership_fee?: number; quantity?: number; unit_label?: "units" | "year" | "nos" }>;
  }
  const record = value as Record<string, unknown>;
  return Object.entries(record).reduce<Record<string, { prepaid_fee?: number; postpaid_fee?: number; first_installment?: number; retainership_fee?: number; quantity?: number; unit_label?: "units" | "year" | "nos" }>>(
    (overrides, [id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return overrides;
    const item = raw as Record<string, unknown>;
    const quantity = Number(item.quantity);
    const unitLabel = item.unit_label === "year" || item.unit_label === "nos" ? item.unit_label : item.unit_label === "units" ? "units" : undefined;
    overrides[id] = {
      prepaid_fee: toNumber(item.prepaid_fee),
      postpaid_fee: toNumber(item.postpaid_fee),
      first_installment: toNumber(item.first_installment),
      retainership_fee: toNumber(item.retainership_fee),
      quantity: Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : undefined,
      unit_label: unitLabel
    };
    return overrides;
  }, {}
  );
}

function normalizeUnitBasis(value: unknown): "units" | "year" | "nos" {
  return value === "year" || value === "nos" ? value : "units";
}

function formatUnitCount(quantity: number, unitLabel: "units" | "year" | "nos") {
  if (unitLabel === "year") {
    return `${quantity} ${quantity === 1 ? "Year" : "Years"}`;
  }

  if (unitLabel === "nos") {
    return `${quantity} Nos`;
  }

  return `${quantity} ${quantity === 1 ? "Unit" : "Units"}`;
}

function formatServiceLabel(name: string, quantity: number, unitLabel: "units" | "year" | "nos") {
  return quantity > 1 ? `${name} (${formatUnitCount(quantity, unitLabel)})` : name;
}

function formatMultiline(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}
