"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CircleOff, CheckCircle2, MoreHorizontal, Trash2 } from "lucide-react";
import { ServiceDrawer } from "@/components/services/service-drawer";
import type { ServiceDocumentTemplateOption } from "@/components/services/service-create-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { StatusPill } from "@/components/ui/status-pill";
import { deleteService, toggleServiceActive } from "@/app/(app)/services/actions";
import {
  parseStructuredDocumentText,
  renderStructuredDocumentInlineHtml,
  type StructuredDocumentLine
} from "@/lib/document-format";
import { formatRetainershipUnit } from "@/lib/service-pricing";
import { formatCurrency, cn } from "@/lib/utils";

export type ServiceListItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  pricing_mode: "fixed" | "engagement_based" | "retainership";
  currency_code: string;
  prepaid_fee: number;
  postpaid_fee: number;
  retainership_fee: number;
  retainership_cycle: "monthly" | "quarterly" | "yearly";
  short_description: string;
  full_description: string;
  first_installment: number | null;
  prepaid_description: string;
  postpaid_description: string;
  first_trigger: string | null;
  second_trigger: string | null;
  timeline_typical: string | null;
  inclusions: string;
  not_included: string;
  required_documents: string;
  extra_costs_clause: string;
  state_variations_apply: boolean;
  is_addon_template: boolean;
  active: boolean;
  internal_notes: string | null;
  document_template_ids: string[];
};

type ServiceListProps = {
  services: ServiceListItem[];
  documentTemplates: ServiceDocumentTemplateOption[];
  categories: string[];
  canManage: boolean;
  initialFilters: {
    q: string;
    category: string;
    status: string;
  };
};

/**
 * Compact service list: one row per service, click chevron to expand.
 *
 * Filtering is intentionally client-side so the filter bar stays responsive
 * without a server round-trip on every keystroke. The page already loads the
 * working set of services; for very large catalogs we'd move this to server
 * filtering with proper indexes.
 */
export function ServiceList({
  services,
  documentTemplates,
  categories,
  canManage,
  initialFilters
}: ServiceListProps) {
  const [query, setQuery] = useState(initialFilters.q);
  const [categoryFilter, setCategoryFilter] = useState(initialFilters.category);
  const [statusFilter, setStatusFilter] = useState(initialFilters.status);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredServices = useMemo(
    () => filterServices(services, { q: query, category: categoryFilter, status: statusFilter }),
    [services, query, categoryFilter, statusFilter]
  );

  const activeCount = filteredServices.filter((service) => service.active).length;
  const documentLookup = useMemo(
    () => new Map(documentTemplates.map((document) => [document.id, document])),
    [documentTemplates]
  );

  function resetFilters() {
    setQuery("");
    setCategoryFilter("");
    setStatusFilter("");
  }

  return (
    <section className="space-y-4">
      {/* Sticky filter bar — keeps search reachable while scrolling a long list. */}
      <div className="sticky top-0 z-10 -mx-1 rounded-lg border border-[#d9ded1] bg-white/95 px-3 py-3 shadow-sm backdrop-blur">
        <div className="grid items-end gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
          <Field label="Search">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="GST, LLP, trademark, compliance..."
            />
          </Field>
          <Field label="Category">
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="addon">Add-on templates</option>
              <option value="retainership">Retainership</option>
            </Select>
          </Field>
          <div className="flex items-end justify-end gap-2">
            {query || categoryFilter || statusFilter ? (
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Clear
              </Button>
            ) : null}
            <StatusPill tone="green">{activeCount} active</StatusPill>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {filteredServices.map((service) => (
          <ServiceRow
            key={service.id}
            service={service}
            expanded={expandedId === service.id}
            onToggle={() => setExpandedId(expandedId === service.id ? null : service.id)}
            documentLookup={documentLookup}
            documentTemplates={documentTemplates}
            categories={categories}
            canManage={canManage}
          />
        ))}
        {!filteredServices.length ? (
          <li className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
            No services match this search.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function ServiceRow({
  service,
  expanded,
  onToggle,
  documentLookup,
  documentTemplates,
  categories,
  canManage
}: {
  service: ServiceListItem;
  expanded: boolean;
  onToggle: () => void;
  documentLookup: Map<string, ServiceDocumentTemplateOption>;
  documentTemplates: ServiceDocumentTemplateOption[];
  categories: string[];
  canManage: boolean;
}) {
  const priceLabel = formatPrice(service);

  return (
    <li
      className={cn(
        "rounded-md border bg-white shadow-sm transition",
        expanded ? "border-[#a0ce4e]" : "border-[#e6ebdc] hover:border-[#d9ded1]"
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#d9ded1] bg-white text-neutral-500 hover:bg-[#eef2e6]"
        >
          <ChevronRight className={cn("h-4 w-4 transition", expanded && "rotate-90")} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-black">{service.name}</h3>
            <StatusPill>{service.category}</StatusPill>
            {service.is_addon_template ? <StatusPill tone="black">Add-on</StatusPill> : null}
            {!service.active ? <StatusPill tone="red">Inactive</StatusPill> : null}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            <span className="font-bold">{service.code}</span>
            {service.short_description ? <span> · {service.short_description}</span> : null}
          </p>
        </div>

        <div className="hidden text-right text-xs sm:block">
          <p className="font-black text-black">{priceLabel}</p>
          <p className="capitalize text-neutral-500">{service.pricing_mode.replaceAll("_", " ")}</p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <ServiceDrawer
              documentTemplates={documentTemplates}
              categories={categories}
              service={service}
            />
            <ServiceActionsMenu service={service} />
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-[#e6ebdc] bg-[#fbfcf8] px-4 py-4 text-sm">
          <ServiceDetail service={service} documentLookup={documentLookup} />
        </div>
      ) : null}
    </li>
  );
}

function ServiceActionsMenu({ service }: { service: ServiceListItem }) {
  return (
    <details className="group relative">
      <summary className="focus-ring flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-[#d9ded1] bg-white text-neutral-600 hover:bg-[#eef2e6]">
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Service actions</span>
      </summary>

      <div className="absolute right-0 top-11 z-20 min-w-[180px] rounded-md border border-[#d9ded1] bg-white p-1 shadow-lg">
        <form action={toggleServiceActive}>
          <input type="hidden" name="id" value={service.id} />
          <input type="hidden" name="nextActive" value={String(!service.active)} />
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-black hover:bg-[#eef2e6]"
          >
            {service.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {service.active ? "Deactivate service" : "Activate service"}
          </button>
        </form>

        <form
          action={deleteService}
          onSubmit={(event) => {
            if (!confirm(`Delete "${service.name}"?\n\nIf this service is already used in quotes, it will be deactivated instead of being removed.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={service.id} />
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-[#b42318] hover:bg-[#fff0ed]"
          >
            <Trash2 className="h-4 w-4" />
            Delete service
          </button>
        </form>
      </div>
    </details>
  );
}

function ServiceDetail({
  service,
  documentLookup
}: {
  service: ServiceListItem;
  documentLookup: Map<string, ServiceDocumentTemplateOption>;
}) {
  const selectedDocs = service.document_template_ids
    .map((id) => documentLookup.get(id))
    .filter((document): document is ServiceDocumentTemplateOption => Boolean(document));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <DetailGrid service={service} />

        <DetailBlock label="Required documents">
          {service.required_documents ? (
            renderStructuredDocumentPreview(service.required_documents)
          ) : (
            <p className="text-xs text-neutral-500">No checklist added.</p>
          )}
        </DetailBlock>

        {selectedDocs.length ? (
          <DetailBlock label="Linked templates">
            <div className="flex flex-wrap gap-1.5">
              {selectedDocs.map((document) => (
                <StatusPill key={document.id}>{document.name}</StatusPill>
              ))}
            </div>
          </DetailBlock>
        ) : null}

        <DetailBlock label="Government fees / out-of-pocket clause">
          <p className="text-xs leading-5 text-neutral-700">
            {service.extra_costs_clause || "Not included for this service"}
          </p>
        </DetailBlock>
      </div>

      <div className="space-y-3">
        {service.full_description ? (
          <DetailBlock label="Service note">
            <RichTextContent className="text-xs" value={service.full_description} />
          </DetailBlock>
        ) : null}
        {service.inclusions ? (
          <DetailBlock label="Inclusions">
            <RichTextContent className="text-xs" value={service.inclusions} />
          </DetailBlock>
        ) : null}
        {service.not_included ? (
          <DetailBlock label="Not included">
            <RichTextContent className="text-xs" value={service.not_included} />
          </DetailBlock>
        ) : null}
        {service.internal_notes ? (
          <DetailBlock label="Internal notes">
            <RichTextContent className="text-xs" value={service.internal_notes} />
          </DetailBlock>
        ) : null}
      </div>
    </div>
  );
}

function DetailGrid({ service }: { service: ServiceListItem }) {
  return (
    <div className="grid gap-2 rounded-md border border-[#e6ebdc] bg-white p-3 text-xs">
      <DetailRow label="Pricing mode" value={service.pricing_mode.replaceAll("_", " ")} />
      {service.pricing_mode === "retainership" ? (
        <DetailRow
          label="Retainership"
          value={`${formatCurrency(service.retainership_fee, service.currency_code)} / ${formatRetainershipUnit(service.retainership_cycle)}`}
        />
      ) : (
        <>
          <DetailRow label="Prepaid" value={formatCurrency(service.prepaid_fee, service.currency_code)} />
          <DetailRow label="Postpaid" value={formatCurrency(service.postpaid_fee, service.currency_code)} />
        </>
      )}
      <DetailRow label="Currency" value={service.currency_code} />
      <DetailRow label="Typical timeline" value={service.timeline_typical || "Not set"} />
      <DetailRow label="State surcharge" value={service.state_variations_apply ? "Applies" : "No"} />
      <DetailRow label="Add-on template" value={service.is_addon_template ? "Yes" : "No"} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-bold text-neutral-600">{label}</span>
      <span className="text-right text-neutral-800">{value}</span>
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#e6ebdc] bg-white p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function renderStructuredDocumentPreview(value: string) {
  const items = parseStructuredDocumentText(value);
  if (!items.length) return null;

  return (
    <div className="space-y-1 text-xs leading-5 text-neutral-700">
      {items.map((item, index) => renderStructuredDocumentPreviewLine(item, `service-doc-${index}`))}
    </div>
  );
}

function renderStructuredDocumentPreviewLine(item: StructuredDocumentLine, key: string) {
  if (item.kind === "break") {
    return <div key={key} className="h-2" />;
  }

  if (item.kind === "heading") {
    return (
      <p
        key={key}
        className="font-black text-black"
        dangerouslySetInnerHTML={{ __html: renderStructuredDocumentInlineHtml(item.label) }}
      />
    );
  }

  return (
    <div key={key} className="flex gap-2">
      <span className="shrink-0">{"•"}</span>
      <span dangerouslySetInnerHTML={{ __html: renderStructuredDocumentInlineHtml(item.label) }} />
    </div>
  );
}

function formatPrice(service: ServiceListItem) {
  if (service.pricing_mode === "retainership") {
    return `${formatCurrency(service.retainership_fee, service.currency_code)} / ${formatRetainershipUnit(service.retainership_cycle)}`;
  }
  const primary = service.prepaid_fee || service.postpaid_fee;
  if (!primary) return "No price set";
  return formatCurrency(primary, service.currency_code);
}

function filterServices(
  services: ServiceListItem[],
  params: { q?: string; category?: string; status?: string }
) {
  const query = (params.q ?? "").trim().toLowerCase();

  return services.filter((service) => {
    const queryMatch =
      !query ||
      [
        service.code,
        service.name,
        service.category,
        service.short_description,
        service.required_documents,
        service.inclusions,
        service.pricing_mode,
        service.retainership_cycle
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const categoryMatch = !params.category || service.category === params.category;
    const statusMatch =
      !params.status ||
      (params.status === "active" && service.active) ||
      (params.status === "inactive" && !service.active) ||
      (params.status === "addon" && service.is_addon_template) ||
      (params.status === "retainership" && service.pricing_mode === "retainership");

    return queryMatch && categoryMatch && statusMatch;
  });
}
