import { RichTextContent } from "@/components/ui/rich-text-content";
import { getDocumentGroups, getQuoteServiceDetails, getQuoteServiceNames, type QuoteRenderData } from "@/lib/quotes/render";
import { renderStructuredDocumentInlineHtml, type StructuredDocumentLine } from "@/lib/document-format";
import { formatRetainershipCycle, formatRetainershipUnit } from "@/lib/service-pricing";
import { defaultQuoteFooterSettings, parseQuoteFooterSettings } from "@/lib/settings";
import { buildPhoneCallHref, buildQuoteWhatsAppMessage, buildWhatsAppHref, firstName, formatCurrency, formatDate } from "@/lib/utils";

export function QuoteDocumentPreview({
  quote,
  footerSettings
}: {
  quote: QuoteRenderData;
  footerSettings?: unknown;
}) {
  const footer = parseQuoteFooterSettings(footerSettings ?? defaultQuoteFooterSettings);
  const serviceNames = getQuoteServiceNames(quote);
  const serviceDetails = getQuoteServiceDetails(quote);
  const pricedServices = serviceDetails.filter((service) => service.pricingMode !== "retainership");
  const retainershipServices = serviceDetails.filter((service) => service.pricingMode === "retainership");
  const clientName = quote.clients?.name ?? "Client";
  const companyName = String(quote.company_name_snapshot ?? "").trim();
  const mobileNumber = String(quote.client_mobile_snapshot ?? "").trim();
  const currencyCode = quote.currency_code ?? "INR";
  const documentGroups = getDocumentGroups(quote);
  const recommendedTotal = quote.recommended_plan === "prepaid" ? quote.prepaid_total_amount : quote.postpaid_total_amount;
  const assistanceHref = buildPhoneCallHref(footer.assistancePhone);
  const consultancyHref = buildPhoneCallHref(footer.consultancyPhone);
  const whatsappHref = buildWhatsAppHref(footer.whatsappPhone, buildQuoteWhatsAppMessage(serviceNames));
  const pricingHeading = getPricingHeading(pricedServices.length > 0, quote.include_prepaid_plan, quote.include_postpaid_plan);

  return (
    <article className="quote-print-document overflow-hidden rounded-lg border border-[#d9ded1] bg-white shadow-sm">
      <div className="quote-color-block quote-document-topbar flex items-start justify-between bg-black p-6 text-white">
        <div>
          <p className="text-2xl font-black">
            <span className="text-[#a0ce4e]">Company</span>ji
          </p>
          <p className="mt-1 text-xs font-bold uppercase text-[#a0ce4e]">India&apos;s #1 rated Startup Consultant</p>
        </div>
        <div className="text-right text-xs leading-5">
          <p className="font-black text-[#a0ce4e]">Quotation</p>
          <p>{quote.quote_id_formatted}</p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <section>
          <p className="text-sm">Dear {firstName(clientName)},</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Thank you for asking us about {serviceNames || "the required service"}. Sharing the quotation below for your review.
          </p>
          {companyName || mobileNumber ? (
            <div className="mt-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] px-3 py-2 text-xs leading-5 text-neutral-600">
              {companyName ? (
                <p>
                  <span className="font-black text-black">Company Name:</span> {companyName}
                </p>
              ) : null}
              {mobileNumber ? (
                <p>
                  <span className="font-black text-black">Mobile Number:</span> {mobileNumber}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="quote-tint-block border-l-4 border-[#a0ce4e] bg-[#f9fbf3] p-4">
          <p className="text-[11px] font-black uppercase text-[#6a912f]">What we will deliver</p>
          <p className="mt-2 text-lg font-black text-black">{serviceNames || "Selected services"}</p>
          {serviceDetails[0]?.shortDescription || serviceDetails[0]?.fullDescription ? (
            <RichTextContent className="mt-2 text-sm leading-6 text-neutral-600" value={serviceDetails[0]?.shortDescription || serviceDetails[0]?.fullDescription} />
          ) : null}
          <p className="mt-2 text-xs italic text-neutral-500">
            Valid until {formatDate(quote.validity_date)}. Government fees occasionally change; if they do, we will tell you exactly what changed.
          </p>
        </section>

        <section>
          <p className="text-[11px] font-black uppercase text-neutral-500">01 - Professional Fees</p>
          <h2 className="mt-1 text-xl font-black">{pricingHeading}</h2>
          {pricedServices.length ? (
            <div className={`mt-4 grid gap-3 ${quote.include_prepaid_plan && quote.include_postpaid_plan ? "md:grid-cols-2" : ""}`}>
              {quote.include_prepaid_plan ? (
                <PlanCard
                  title="Prepaid"
                  amount={quote.prepaid_total_amount}
                  recommended={quote.recommended_plan === "prepaid"}
                  text={pricedServices.length === 1 ? pricedServices[0]?.prepaidDescription || "Full payment upfront." : "Full payment upfront. Service-wise terms are shown below."}
                  currencyCode={currencyCode}
                />
              ) : null}
              {quote.include_postpaid_plan ? (
                <PlanCard
                  title="Postpaid"
                  amount={quote.postpaid_total_amount}
                  recommended={quote.recommended_plan === "postpaid"}
                  text={pricedServices.length === 1 ? pricedServices[0]?.postpaidDescription || "You pay after the agreed milestone." : "Pay after the agreed milestone. Service-wise terms are shown below."}
                  currencyCode={currencyCode}
                />
              ) : null}
            </div>
          ) : null}
          {quote.show_service_breakup && pricedServices.length ? (
            <PreviewTable
              headers={["Service", "Qty", ...(quote.include_prepaid_plan ? ["Prepaid"] : []), ...(quote.include_postpaid_plan ? ["Postpaid"] : [])]}
              rows={pricedServices.map((service) => [
                service.name,
                formatUnitCount(service.quantity, service.unitLabel),
                ...(quote.include_prepaid_plan ? [formatCurrency(service.prepaidFee, currencyCode)] : []),
                ...(quote.include_postpaid_plan ? [formatCurrency(service.postpaidFee, currencyCode)] : [])
              ])}
            />
          ) : null}
          {retainershipServices.length ? (
            <PreviewTable
              headers={["Retainership service", "Qty", "Billing cycle", "Recurring total"]}
              rows={retainershipServices.map((service) => [
                service.name,
                formatUnitCount(service.quantity, service.unitLabel),
                formatRetainershipCycle(service.retainershipCycle),
                formatCurrency(service.retainershipFee, currencyCode)
              ])}
            />
          ) : null}
          {pricedServices.length ? (
            <PreviewTable
              headers={["Service terms", ...(quote.include_prepaid_plan ? ["Prepaid"] : []), ...(quote.include_postpaid_plan ? ["Postpaid"] : [])]}
              rows={pricedServices.map((service) => [
                service.name,
                ...(quote.include_prepaid_plan ? [service.prepaidDescription || "Full payment upfront."] : []),
                ...(quote.include_postpaid_plan ? [service.postpaidDescription || "Payment after the agreed milestone."] : [])
              ])}
            />
          ) : null}
          <div className="quote-tint-block mt-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-sm">
            <AmountLine label="Recommended total" value={formatCurrency(recommendedTotal, currencyCode)} strong />
            {quote.state_variation_add ? <AmountLine label="State variation" value={formatCurrency(quote.state_variation_add, currencyCode)} /> : null}
            {quote.addon_total ? <AmountLine label="Add-ons" value={formatCurrency(quote.addon_total, currencyCode)} /> : null}
            {quote.other_fee_total ? <AmountLine label="Other fees / adjustments" value={formatCurrency(quote.other_fee_total, currencyCode)} /> : null}
            {quote.discount_amount ? <AmountLine label="Discount" value={`-${formatCurrency(quote.discount_amount, currencyCode)}`} /> : null}
            {quote.gst_amount ? <AmountLine label={`GST @ ${quote.gst_rate_percent}%`} value={formatCurrency(quote.gst_amount, currencyCode)} /> : null}
            <AmountLine label="Total" value={formatCurrency(quote.total_amount, currencyCode)} strong />
          </div>
        </section>

        <section>
          <p className="text-[11px] font-black uppercase text-neutral-500">02 - What is included</p>
          <div className="mt-3 space-y-3">
            {serviceDetails.filter((service) => service.inclusions).length ? (
              serviceDetails
                .filter((service) => service.inclusions)
                .map((service) => (
                  <div key={service.id} className="rounded-md border border-[#e6ebdc] p-4 text-sm leading-6 text-neutral-700">
                    <p className="font-black text-black">{service.name}</p>
                    <RichTextContent className="mt-2" value={service.inclusions} />
                  </div>
                ))
            ) : (
              <p className="rounded-md border border-[#e6ebdc] p-4 text-sm text-neutral-500">No inclusions were saved for this quote.</p>
            )}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-black uppercase text-neutral-500">03 - What we need from you</p>
          <div className="mt-3 space-y-3">
            {documentGroups.length ? (
              documentGroups.map((group) => (
                <div key={group.title} className="rounded-md border border-[#e6ebdc]">
                  <p className="quote-tint-block border-b border-[#e6ebdc] bg-[#fbfcf8] px-3 py-2 text-sm font-black">{group.title}</p>
                  <div className="p-3 text-sm leading-6 text-neutral-700">{renderDocumentLines(group.title, group.items)}</div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-[#e6ebdc] p-4 text-sm text-neutral-500">No document requirements were saved for this quote.</p>
            )}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-black uppercase text-neutral-500">04 - Service note and timeline</p>
          <div className="mt-3 space-y-3">
            {serviceDetails.length ? (
              serviceDetails.map((service) => (
                <div key={service.id} className="quote-tint-block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm leading-6 text-neutral-700">
                  <p className="font-black text-black">{service.name}</p>
                  {service.quantity > 1 ? (
                    <p className="mt-1 text-xs font-bold uppercase text-neutral-500">{formatUnitCount(service.quantity, service.unitLabel)} selected</p>
                  ) : null}
                  {service.fullDescription || service.shortDescription ? (
                    <div className="mt-2">
                      <span className="font-black text-black">Note:</span>
                      <RichTextContent className="mt-2" value={service.fullDescription || service.shortDescription} />
                    </div>
                  ) : null}
                  {service.timelineTypical ? (
                    <p className="mt-2">
                      <span className="font-black text-black">Typical timeline:</span> {service.timelineTypical}
                    </p>
                  ) : null}
                  {service.pricingMode === "retainership" ? (
                    <p className="mt-2">
                      <span className="font-black text-black">Retainership fee:</span> {formatCurrency(service.retainershipFee, currencyCode)} / {formatRetainershipUnit(service.retainershipCycle)}
                    </p>
                  ) : null}
                  {quote.include_postpaid_plan && service.pricingMode !== "retainership" && service.firstInstallment ? (
                    <p className="mt-2">
                      <span className="font-black text-black">In case of Postpaid - First installment:</span> {formatCurrency(service.firstInstallment, currencyCode)}
                      {service.firstTrigger ? ` - ${service.firstTrigger}` : ""}
                    </p>
                  ) : null}
                  {quote.include_postpaid_plan && service.pricingMode !== "retainership" && service.secondInstallment ? (
                    <p className="mt-1">
                      <span className="font-black text-black">In case of Postpaid - Second installment:</span> {formatCurrency(service.secondInstallment, currencyCode)}
                      {service.secondTrigger ? ` - ${service.secondTrigger}` : ""}
                    </p>
                  ) : null}
                  {service.extraCostsClause ? <p className="mt-2 text-xs text-neutral-500">{service.extraCostsClause}</p> : null}
                </div>
              ))
            ) : (
              <p className="rounded-md border border-[#e6ebdc] p-4 text-sm text-neutral-500">No service notes were saved for this quote.</p>
            )}
          </div>
        </section>

        {quote.custom_note ? (
          <section className="quote-tint-block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm leading-6 text-neutral-700">
            {quote.custom_note}
          </section>
        ) : null}

        <section>
          <p className="text-[11px] font-black uppercase text-neutral-500">05 - Refund policy</p>
          <div className="quote-light-block mt-3 rounded-md border border-[#e6ebdc] bg-[#f9f9f9] p-4 text-sm leading-6 text-neutral-700">
            <p>Postpaid: No advance, so no refund question.</p>
            <p>Prepaid: 100% refund if we have not started. Once we begin, no refund.</p>
            <p>That is our entire policy. No fine print.</p>
          </div>
        </section>

        <section className="quote-color-block bg-black p-5 text-center text-white">
          <p className="text-[10px] font-black uppercase text-[#a0ce4e]">Who we are</p>
          <p className="mt-3 text-sm leading-6">
            Since 2009, Companyji has helped 5,000+ entrepreneurs and businesses handle the side of business that usually slows people down. We keep the process simple, move quickly, and give clients the kind of guidance that actually helps them move forward.
          </p>
        </section>

        <section className="text-sm leading-6 text-neutral-700">
          <p>If this looks fine, reply with Accepted. If anything needs to change, reply with the change and we will update it clearly.</p>
          <p className="mt-4">Warm regards,</p>
          <p className="font-black text-black">Team SBS</p>
        </section>
      </div>

      <footer className="quote-color-block bg-black p-5 text-white">
        <div className="grid gap-3 sm:grid-cols-3">
          <FooterItem label={footer.assistanceLabel} phone={footer.assistancePhone} href={assistanceHref} />
          <FooterItem label={footer.consultancyLabel} phone={footer.consultancyPhone} href={consultancyHref} />
          <FooterItem label={footer.whatsappLabel} phone={footer.whatsappPhone} href={whatsappHref} external />
        </div>
        <p className="mt-5 text-center text-[10px] uppercase text-neutral-500">{footer.footerLine}</p>
      </footer>
    </article>
  );
}

function getPricingHeading(hasPlanPricing: boolean, includePrepaidPlan: boolean, includePostpaidPlan: boolean) {
  if (!hasPlanPricing) return "Retainership fees";
  if (includePrepaidPlan && includePostpaidPlan) return "Two ways to engage us";
  if (includePrepaidPlan) return "Prepaid professional fees";
  if (includePostpaidPlan) return "Postpaid professional fees";
  return "Professional fees";
}

function PlanCard({ title, amount, text, recommended, currencyCode }: { title: string; amount: number; text: string; recommended: boolean; currencyCode: string }) {
  return (
    <div className={`quote-plan-card border p-4 ${recommended ? "quote-tint-block border-[#a0ce4e] bg-[#f9fbf3]" : "border-[#e5e5e5] bg-white"}`}>
      <p className="text-[10px] font-black uppercase text-neutral-500">
        {title} {recommended ? <span className="quote-badge ml-1 bg-[#a0ce4e] px-1.5 py-0.5 text-[9px] text-black">Recommended</span> : null}
      </p>
      <p className="mt-2 text-2xl font-black">{formatCurrency(amount, currencyCode)}</p>
      <p className="mt-3 text-xs leading-5 text-neutral-600">{text}</p>
    </div>
  );
}

function AmountLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 border-b border-[#e6ebdc] py-2 last:border-b-0 ${strong ? "font-black text-black" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FooterItem({ label, phone, href, external = false }: { label: string; phone: string; href?: string; external?: boolean }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-[10px] font-black uppercase text-neutral-500">{label}</p>
      {href ? (
        <a
          href={href}
          className="mt-1 inline-block text-sm font-black text-[#a0ce4e] underline-offset-2 hover:underline"
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {phone}
        </a>
      ) : (
        <p className="mt-1 text-sm font-black text-[#a0ce4e]">{phone}</p>
      )}
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="bg-[#f9fbf3] text-left">
            {headers.map((header) => (
              <th key={header} className="border border-[#e5e5e5] p-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className={`border border-[#e5e5e5] p-2 ${cellIndex === 0 ? "font-bold" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

function renderDocumentLines(groupTitle: string, items: StructuredDocumentLine[]) {
  return (
    <div className="space-y-1">
      {items.map((item, index) => {
        if (item.kind === "break") {
          return <div key={`${groupTitle}-break-${index}`} className="h-2" />;
        }
        if (item.kind === "heading") {
          return (
            <p
              key={`${groupTitle}-heading-${index}`}
              className="font-black text-black"
              dangerouslySetInnerHTML={{ __html: renderStructuredDocumentInlineHtml(item.label) }}
            />
          );
        }
        return (
          <div key={`${groupTitle}-item-${index}`} className="flex gap-2">
            <span className="shrink-0">{"\u2022"}</span>
            <span dangerouslySetInnerHTML={{ __html: renderStructuredDocumentInlineHtml(item.label) }} />
          </div>
        );
      })}
    </div>
  );
}
