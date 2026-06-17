"use client";

import { Mail, MessageCircle, Plus, Send, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createQuoteDraft } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import {
  parseStructuredDocumentText,
  renderStructuredDocumentInlineHtml,
  type StructuredDocumentLine
} from "@/lib/document-format";
import {
  calculateTwoPlanPricingWithAdjustments,
  type CustomServiceItem,
  type QuoteAddon,
  type QuoteFeeItem,
  type QuotePlan
} from "@/lib/pricing";
import { applyQuoteDiscountToInstallments } from "@/lib/quotes/installments";
import {
  defaultQuotePreviewCopy,
  type QuoteFooterSettings,
  type QuotePreviewCopy
} from "@/lib/settings";
import { defaultCurrencyCode, supportedCurrencyOptions, type SupportedCurrencyCode } from "@/lib/currency";
import { buildRetainershipDescription, formatRetainershipCycle, formatRetainershipUnit } from "@/lib/service-pricing";
import { buildTagLabelMap, normalizeTagName } from "@/lib/pipeline-taxonomy";
import { buildPhoneCallHref, buildQuoteWhatsAppMessage, buildWhatsAppHref, firstName, formatCurrency } from "@/lib/utils";

export type QuoteServiceOption = {
  id: string;
  name: string;
  category: string;
  short_description: string;
  full_description: string;
  pricing_mode: "fixed" | "engagement_based" | "retainership";
  currency_code: string;
  prepaid_fee: number;
  postpaid_fee: number;
  retainership_fee: number;
  retainership_cycle: string;
  prepaid_description: string;
  postpaid_description: string;
  first_installment: number | null;
  first_trigger: string | null;
  second_trigger: string | null;
  state_variations_apply: boolean;
  required_documents: string;
  inclusions: string;
  timeline_typical: string | null;
  extra_costs_clause: string;
  is_addon_template: boolean;
};

export type QuoteStateOption = {
  id: string;
  name: string;
  surcharge: number;
};

export type QuoteClientOption = {
  id: string;
  code: string;
  group_id: string | null;
  name: string;
  client_type: string | null;
  source: string | null;
  tags: string[] | null;
  primary_mobile?: string | null;
  secondary_mobile?: string | null;
};

export type QuoteDocumentTemplateOption = {
  id: string;
  name: string;
  category: string;
};

export type QuoteServiceDocumentLink = {
  service_id: string;
  document_template_id: string;
};

export type QuoteCannedMessageOption = {
  id: string;
  title: string;
  category: string;
  body: string;
  use_case: string;
};

export type QuoteDefinedTagOption = {
  id: string;
  name: string;
  category_name: string;
};

export type QuoteBuilderLeadPrefill = {
  id: string;
  company_name: string;
  contact_name: string | null;
  director_name: string | null;
  email: string | null;
  phone: string;
  alternate_phone: string | null;
  whatsapp_number: string | null;
  source: string;
  status: string;
  tags: string[] | null;
  assigned_to?: string | null;
  created_by?: string | null;
};

type QuoteDocumentItem = {
  id: string;
  label: string;
  kind: StructuredDocumentLine["kind"];
  source: "library" | "service_text" | "custom";
  category?: string;
  serviceId?: string;
  serviceName?: string;
};

type CannedNoteItem = {
  id: string;
  title: string;
  category: string;
  body: string;
};

type DocumentGroup = {
  title: string;
  items: QuoteDocumentItem[];
};

type ServiceFeeOverride = {
  prepaid_fee: number;
  postpaid_fee: number;
  first_installment: number;
  retainership_fee: number;
  quantity: number;
  unit_label: UnitBasis;
};

type UnitBasis = "units" | "year" | "nos";

type QuoteServiceDetailCard = {
  id: string;
  pricingMode: QuoteServiceOption["pricing_mode"] | "fixed";
  name: string;
  quantity: number;
  unitLabel: UnitBasis;
  description: string;
  timelineTypical: string;
  postpaidFee: number;
  firstInstallment: number;
  secondInstallment?: number;
  firstTrigger: string;
  secondTrigger: string;
  extraCostsClause: string;
  retainershipFee?: number;
  retainershipDisplayFee?: number;
  retainershipCycle?: string;
};

export function QuoteBuilder({
  services: serviceOptions,
  states: stateOptions,
  clients: clientOptions,
  footerSettings,
  documentTemplates: documentTemplateOptions,
  serviceDocumentLinks: serviceDocumentLinkOptions,
  cannedMessages: cannedMessageOptions,
  definedTags: definedTagOptions,
  initialLead
}: {
  services: QuoteServiceOption[];
  states: QuoteStateOption[];
  clients: QuoteClientOption[];
  footerSettings: QuoteFooterSettings;
  documentTemplates: QuoteDocumentTemplateOption[];
  serviceDocumentLinks: QuoteServiceDocumentLink[];
  cannedMessages: QuoteCannedMessageOption[];
  definedTags: QuoteDefinedTagOption[];
  initialLead?: QuoteBuilderLeadPrefill | null;
}) {
  const services = serviceOptions;
  const states = stateOptions;
  const clients = clientOptions;
  const documentTemplates = documentTemplateOptions;
  const serviceDocumentLinks = serviceDocumentLinkOptions;
  const cannedMessages = cannedMessageOptions;
  const definedTags = definedTagOptions;

  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [existingClientId, setExistingClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientName, setClientName] = useState(initialLead?.contact_name || initialLead?.director_name || "");
  const [companyName, setCompanyName] = useState(initialLead?.company_name || "");
  const [primaryMobile, setPrimaryMobile] = useState(initialLead?.phone || "");
  const [secondaryMobile, setSecondaryMobile] = useState(initialLead?.alternate_phone || "");
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>(initialLead?.tags ?? []);
  const [source, setSource] = useState(initialLead?.source || "Office Manual");
  const [quoteCurrency, setQuoteCurrency] = useState(defaultCurrencyCode);
  const [recommendedPlan, setRecommendedPlan] = useState<Extract<QuotePlan, "prepaid" | "postpaid">>("postpaid");
  const [includePrepaidPlan, setIncludePrepaidPlan] = useState(true);
  const [includePostpaidPlan, setIncludePostpaidPlan] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [stateId, setStateId] = useState("");
  const [addons, setAddons] = useState<QuoteAddon[]>([]);
  const [otherFees, setOtherFees] = useState<QuoteFeeItem[]>([]);
  const [customServices, setCustomServices] = useState<CustomServiceItem[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showAllServices, setShowAllServices] = useState(false);
  const [showServiceBreakup, setShowServiceBreakup] = useState(true);
  const [serviceFeeOverrides, setServiceFeeOverrides] = useState<Record<string, ServiceFeeOverride>>({});
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstRatePercent, setGstRatePercent] = useState(0);
  const [gstBaseAmount, setGstBaseAmount] = useState("");
  const [documentEdits, setDocumentEdits] = useState<Record<string, string>>({});
  const [removedDocumentIds, setRemovedDocumentIds] = useState<string[]>([]);
  const [customDocumentItems, setCustomDocumentItems] = useState<QuoteDocumentItem[]>([]);
  const [customDocument, setCustomDocument] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [selectedCannedMessages, setSelectedCannedMessages] = useState<CannedNoteItem[]>([]);
  const [cannedCategoryFilter, setCannedCategoryFilter] = useState("");
  const [previewCopy, setPreviewCopy] = useState<QuotePreviewCopy>(defaultQuotePreviewCopy);
  const [currencyChangeNotice, setCurrencyChangeNotice] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(services.map((service) => service.category))].sort(), [services]);
  const documentTemplatesById = useMemo(
    () => new Map(documentTemplates.map((document) => [document.id, document])),
    [documentTemplates]
  );
  const documentTemplateIdsByService = useMemo(
    () =>
      serviceDocumentLinks.reduce<Record<string, string[]>>((grouped, link) => {
        grouped[link.service_id] = [...(grouped[link.service_id] ?? []), link.document_template_id];
        return grouped;
      }, {}),
    [serviceDocumentLinks]
  );

  const selectedClient = clients.find((client) => client.id === existingClientId);
  const displayClientName = clientMode === "existing" ? selectedClient?.name ?? "Client" : clientName || "Client";
  const previewMobileNumber =
    clientMode === "existing"
      ? selectedClient?.primary_mobile || selectedClient?.secondary_mobile || ""
      : primaryMobile || secondaryMobile || "";
  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds]
  );
  const selectedState = states.find((state) => state.id === stateId);
  const selectedServicesWithFees = selectedServices.map((service) => {
    const override = serviceFeeOverrides[service.id];
    const retainershipFee = override?.retainership_fee ?? service.retainership_fee ?? service.postpaid_fee;
    const quantity = Math.max(1, override?.quantity ?? 1);
    const unitLabel = normalizeUnitBasis(override?.unit_label);

    if (service.pricing_mode === "retainership") {
      return {
        ...service,
        quantity,
        unit_label: unitLabel,
        retainership_fee: retainershipFee,
        prepaid_fee: retainershipFee,
        postpaid_fee: retainershipFee,
        first_installment: 0,
        prepaid_description: buildRetainershipDescription(service.retainership_cycle),
        postpaid_description: buildRetainershipDescription(service.retainership_cycle)
      };
    }

    return {
      ...service,
      quantity,
      unit_label: unitLabel,
      retainership_fee: retainershipFee,
      prepaid_fee: override?.prepaid_fee ?? service.prepaid_fee,
      postpaid_fee: override?.postpaid_fee ?? service.postpaid_fee,
      first_installment: override?.first_installment ?? service.first_installment
    };
  });
  const retainershipServicesWithFees = selectedServicesWithFees.filter((service) => service.pricing_mode === "retainership");
  const fixedServicesWithFees = selectedServicesWithFees.filter((service) => service.pricing_mode !== "retainership");
  const priceableCustomServices = customServices.map((service) => ({
    id: `custom:${service.name}`,
    name: service.name,
    prepaid_fee: service.prepaid_fee,
    postpaid_fee: service.postpaid_fee,
    state_variations_apply: false,
    quantity: 1
  }));
  const allPriceableServices = [...selectedServicesWithFees, ...priceableCustomServices];
  const twoPlanPricing = calculateTwoPlanPricingWithAdjustments({
    services: allPriceableServices,
    stateSurcharge: selectedState?.surcharge ?? 0,
    addons,
    otherFees,
    discountAmount,
    gstRatePercent,
    gstBaseAmount: gstBaseAmount === "" ? null : Number(gstBaseAmount)
  });
  const recommendedPricing = twoPlanPricing[recommendedPlan];

  const filteredServices = services.filter((service) => {
    const query = serviceSearch.trim().toLowerCase();
    const queryMatch =
      !query ||
      [service.name, service.category, service.short_description].join(" ").toLowerCase().includes(query);
    const categoryMatch = !categoryFilter || service.category === categoryFilter;
    const currencyMatch = service.currency_code === quoteCurrency;
    return queryMatch && categoryMatch && currencyMatch;
  });
  const visibleServices = showAllServices || serviceSearch || categoryFilter ? filteredServices : filteredServices.slice(0, 8);
  const addonTemplates = services.filter(
    (service) => (service.is_addon_template || service.category.toLowerCase() === "add-on") && service.currency_code === quoteCurrency
  );

  const matchingClients = clients
    .filter((client) => {
      const query = clientSearch.trim().toLowerCase();
      if (!query) return true;
      return [client.name, client.code, client.group_id ?? "", client.client_type ?? "", client.source ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 8);

  const defaultDocumentItems = useMemo<QuoteDocumentItem[]>(() => {
    const fromServices = selectedServices.flatMap((service) => {
      const linkedDocuments = (documentTemplateIdsByService[service.id] ?? [])
        .map((documentTemplateId) => documentTemplatesById.get(documentTemplateId))
        .filter((document): document is QuoteDocumentTemplateOption => Boolean(document))
        .map((document) => ({
          id: `library:${service.id}:${document.id}`,
          label: document.name,
          kind: "item" as const,
          source: "library" as const,
          category: document.category,
          serviceId: service.id,
          serviceName: service.name
        }));

      const textDocuments = splitChecklist(service.required_documents).map((document, index) => ({
        id: `service:${service.id}:${index}:${document.kind}:${document.label.toLowerCase()}`,
        label: document.label,
        kind: document.kind,
        source: "service_text" as const,
        serviceId: service.id,
        serviceName: service.name
      }));

      return [...linkedDocuments, ...textDocuments];
    });

    const fromCustom = customServices.flatMap((service, serviceIndex) =>
      splitChecklist(service.required_documents ?? "").map((document, documentIndex) => ({
        id: `custom-service:${serviceIndex}:${documentIndex}:${document.kind}:${document.label.toLowerCase()}`,
        label: document.label,
        kind: document.kind,
        source: "service_text" as const,
        serviceName: service.name || "Custom service"
      }))
    );

    const seen = new Set<string>();
    return [...fromServices, ...fromCustom].filter((document) => {
      if (document.kind === "break") return true;
      const key = `${document.serviceName ?? "General"}:${document.kind}:${document.label}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customServices, documentTemplateIdsByService, documentTemplatesById, selectedServices]);

  const documentItems = useMemo(() => {
    const removedIds = new Set(removedDocumentIds);
    const defaults = defaultDocumentItems
      .filter((document) => !removedIds.has(document.id))
      .map((document) => ({ ...document, label: documentEdits[document.id] ?? document.label }));
    return [...defaults, ...customDocumentItems];
  }, [customDocumentItems, defaultDocumentItems, documentEdits, removedDocumentIds]);
  const visibleDocumentItems = documentItems.filter((document) => document.kind === "break" || document.label.trim());
  const documentGroups = useMemo(() => groupQuoteDocuments(visibleDocumentItems), [visibleDocumentItems]);

  const serviceNames = [
    ...selectedServicesWithFees.map((service) => formatServiceLabel(service.name, service.quantity, service.unit_label)),
    ...customServices.map((service) => service.name).filter(Boolean)
  ];
  const quoteServiceLabel = serviceNames.length ? serviceNames.join(" + ") : "the selected service";
  const serviceLines = [
    ...fixedServicesWithFees.map((service) => ({
      id: service.id,
      name: service.name,
      quantity: service.quantity,
      unit_label: service.unit_label,
      prepaid_fee: service.prepaid_fee,
      postpaid_fee: service.postpaid_fee,
      prepaid_total: service.prepaid_fee * service.quantity,
      postpaid_total: service.postpaid_fee * service.quantity,
      first_installment_total: Math.max(0, Number(service.first_installment ?? 0)) * service.quantity,
      second_installment_total: Math.max(0, service.postpaid_fee - Math.max(0, Number(service.first_installment ?? 0))) * service.quantity
    })),
    ...customServices.map((service, index) => ({
      id: `custom-${index}`,
      name: service.name || "Custom service",
      quantity: 1,
      unit_label: "units" as UnitBasis,
      prepaid_fee: service.prepaid_fee,
      postpaid_fee: service.postpaid_fee,
      prepaid_total: service.prepaid_fee,
      postpaid_total: service.postpaid_fee,
      first_installment_total: 0,
      second_installment_total: service.postpaid_fee
    }))
  ];
  const retainershipLines = retainershipServicesWithFees.map((service) => ({
    id: service.id,
    name: service.name,
    quantity: service.quantity,
    unit_label: service.unit_label,
    cycle: service.retainership_cycle,
    retainership_fee: service.retainership_fee,
    retainership_total: service.retainership_fee * service.quantity
  }));
  const planTermLines = [
    ...fixedServicesWithFees.map((service) => ({
      id: service.id,
      name: service.name,
      prepaid_description: service.prepaid_description || "Full payment upfront.",
      postpaid_description: service.postpaid_description || "Payment after the agreed milestone."
    })),
    ...customServices.map((service, index) => ({
      id: `custom-plan-${index}`,
      name: service.name || "Custom service",
      prepaid_description: "Full payment upfront.",
      postpaid_description: "Payment after the agreed milestone."
    }))
  ];
  const fixedServiceDetailInputs: QuoteServiceDetailCard[] = [
      ...fixedServicesWithFees.map((service): QuoteServiceDetailCard => ({
        id: service.id,
        pricingMode: service.pricing_mode as QuoteServiceDetailCard["pricingMode"],
        name: service.name,
        quantity: service.quantity,
        unitLabel: service.unit_label,
        description: service.full_description || service.short_description || "",
        timelineTypical: service.timeline_typical || "",
        postpaidFee: Math.max(0, Number(service.postpaid_fee ?? 0)) * service.quantity,
        firstInstallment: Math.max(0, Number(service.first_installment ?? 0)) * service.quantity,
        firstTrigger: service.first_trigger || "",
        secondTrigger: service.second_trigger || "",
        extraCostsClause: service.extra_costs_clause || ""
      })),
      ...customServices.map((service, index): QuoteServiceDetailCard => ({
        id: `custom-detail-${index}`,
        pricingMode: "fixed",
        name: service.name || "Custom service",
        quantity: 1,
        unitLabel: "units",
        description: service.description || "",
        timelineTypical: "",
        postpaidFee: Math.max(0, Number(service.postpaid_fee ?? 0)),
        firstInstallment: 0,
        firstTrigger: "",
        secondTrigger: "",
        extraCostsClause: ""
      }))
    ];
  const fixedServiceDetailCards = applyQuoteDiscountToInstallments<QuoteServiceDetailCard>(fixedServiceDetailInputs, discountAmount);
  const retainershipDetailCards: QuoteServiceDetailCard[] = retainershipServicesWithFees.map((service) => ({
      id: service.id,
      pricingMode: service.pricing_mode as QuoteServiceDetailCard["pricingMode"],
      name: service.name,
      quantity: service.quantity,
      unitLabel: service.unit_label,
      description: service.full_description || service.short_description || "",
      timelineTypical: service.timeline_typical || "",
      postpaidFee: Math.max(0, Number(service.retainership_fee ?? 0)) * service.quantity,
      discountedPostpaidFee: Math.max(0, Number(service.retainership_fee ?? 0)) * service.quantity,
      firstInstallment: 0,
      secondInstallment: 0,
      firstTrigger: "",
      secondTrigger: "",
      extraCostsClause: service.extra_costs_clause || "",
      retainershipFee: Math.max(0, Number(service.retainership_fee ?? 0)) * service.quantity,
      retainershipDisplayFee: Math.max(0, Number(service.retainership_fee ?? 0)) * service.quantity,
      retainershipCycle: service.retainership_cycle
    }));
  const serviceDetailCards: QuoteServiceDetailCard[] = [...fixedServiceDetailCards, ...retainershipDetailCards];
  const inclusions = selectedServices.filter((service) => service.inclusions);
  const visibleAddons = addons.filter((addon) => addon.description || addon.amount > 0);
  const visibleOtherFees = otherFees.filter((fee) => fee.description || fee.amount !== 0);
  const hasStateVariation = recommendedPricing.stateVariationAdd > 0;
  const prepaidPlanText =
    planTermLines.length === 1 ? planTermLines[0].prepaid_description : "Full payment upfront. Service-wise terms are shown below.";
  const postpaidPlanText =
    planTermLines.length === 1 ? planTermLines[0].postpaid_description : "Pay after the agreed milestone. Service-wise terms are shown below.";
  const hasPlanPricing = serviceLines.length > 0;
  const hasRetainershipPricing = retainershipLines.length > 0;
  const pricingHeading = getPricingHeading(hasPlanPricing, includePrepaidPlan, includePostpaidPlan);
  const cannedCategories = [...new Set(cannedMessages.map((message) => message.category))].sort();
  const filteredCannedMessages = cannedMessages.filter((message) => !cannedCategoryFilter || message.category === cannedCategoryFilter);
  const noteBodies = [...selectedCannedMessages.map((message) => message.body), customNote].filter((note) => note.trim());
  const tagLabelMap = useMemo(() => buildTagLabelMap(definedTags), [definedTags]);
  const groupedDefinedTags = useMemo(() => groupDefinedTags(definedTags), [definedTags]);
  const whoWeAreText = [previewCopy.whoWeAre, previewCopy.whoWeAreSubtext].filter((item) => item.trim()).join(" ");

  // Client-side submit guards. The server action validates the same conditions
  // and now redirects with an error message, but disabling the buttons here is
  // both faster feedback and prevents the round-trip altogether.
  const hasAnyService =
    selectedServiceIds.length > 0 || customServices.some((service) => Boolean(service.name.trim()));
  const existingClientMissing = clientMode === "existing" && !existingClientId;
  const newClientNameMissing = clientMode === "new" && !clientName.trim();
  const submitDisabledReason = !hasAnyService
    ? "Pick at least one service (or add a custom line) to save the quote."
    : existingClientMissing
      ? "Pick an existing client to continue."
      : newClientNameMissing
        ? "Enter the client name to continue."
        : null;
  const submitDisabled = Boolean(submitDisabledReason);

  function toggleService(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return;
    setSelectedServiceIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      return next;
    });
  }

  function changeQuoteCurrency(nextCurrency: SupportedCurrencyCode) {
    const previousCurrency = quoteCurrency;
    // Count services about to be removed *before* we mutate state so we can
    // surface a clear "this is what just happened" message instead of silently
    // wiping the selection.
    const droppedCount = selectedServiceIds.filter(
      (id) => services.find((service) => service.id === id)?.currency_code !== nextCurrency
    ).length;

    setQuoteCurrency(nextCurrency);
    setSelectedServiceIds((current) =>
      current.filter((id) => services.find((service) => service.id === id)?.currency_code === nextCurrency)
    );
    setServiceFeeOverrides((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([serviceId]) => services.find((service) => service.id === serviceId)?.currency_code === nextCurrency
        )
      )
    );

    if (droppedCount > 0) {
      setCurrencyChangeNotice(
        `Removed ${droppedCount} service${droppedCount === 1 ? "" : "s"} priced in ${previousCurrency}. One quote uses one currency.`
      );
      window.setTimeout(() => setCurrencyChangeNotice(null), 6000);
    } else {
      setCurrencyChangeNotice(null);
    }
  }

  function updateAddon(index: number, patch: Partial<QuoteAddon>) {
    setAddons((current) => current.map((addon, addonIndex) => (addonIndex === index ? { ...addon, ...patch } : addon)));
  }

  function updateOtherFee(index: number, patch: Partial<QuoteFeeItem>) {
    setOtherFees((current) => current.map((fee, feeIndex) => (feeIndex === index ? { ...fee, ...patch } : fee)));
  }

  function updateDocumentItem(document: QuoteDocumentItem, label: string) {
    if (document.source === "custom") {
      setCustomDocumentItems((current) => current.map((item) => (item.id === document.id ? { ...item, label } : item)));
      return;
    }
    setDocumentEdits((current) => ({ ...current, [document.id]: label }));
  }

  function removeDocumentItem(document: QuoteDocumentItem) {
    if (document.source === "custom") {
      setCustomDocumentItems((current) => current.filter((item) => item.id !== document.id));
      return;
    }
    setRemovedDocumentIds((current) => (current.includes(document.id) ? current : [...current, document.id]));
  }

  function addCustomDocument() {
    const label = customDocument.trim();
    if (!label) return;
    const structuredItems = splitChecklist(label).map((document, index) => ({
      id: `custom:${Date.now()}:${index}`,
      label: document.label,
      kind: document.kind,
      source: "custom" as const,
      serviceName: "Additional documents"
    }));
    setCustomDocumentItems((current) => [...current, ...structuredItems]);
    setCustomDocument("");
  }

  function addCannedMessage(message: QuoteCannedMessageOption) {
    setSelectedCannedMessages((current) =>
      current.some((item) => item.id === message.id)
        ? current
        : [...current, { id: message.id, title: message.title, category: message.category, body: message.body }]
    );
  }

  function setPlanVisibility(planName: "prepaid" | "postpaid", visible: boolean) {
    if (planName === "prepaid") {
      if (!visible && !includePostpaidPlan) return;
      setIncludePrepaidPlan(visible);
      if (!visible && recommendedPlan === "prepaid") setRecommendedPlan("postpaid");
      return;
    }

    if (!visible && !includePrepaidPlan) return;
    setIncludePostpaidPlan(visible);
    if (!visible && recommendedPlan === "postpaid") setRecommendedPlan("prepaid");
  }

  function updateCustomService(index: number, patch: Partial<CustomServiceItem>) {
    setCustomServices((current) => current.map((service, serviceIndex) => (serviceIndex === index ? { ...service, ...patch } : service)));
  }

  function updateServiceFee(service: QuoteServiceOption, field: keyof ServiceFeeOverride, value: number | UnitBasis) {
    setServiceFeeOverrides((current) => ({
      ...current,
      [service.id]: buildNextServiceOverride(current[service.id], service, field, value)
    }));
  }

  function finalizeServiceFee(serviceId: string) {
    setServiceFeeOverrides((current) => {
      const existing = current[serviceId];
      if (!existing) return current;
      return {
        ...current,
        [serviceId]: clampServiceFeeOverride(existing)
      };
    });
  }

  function updatePreviewCopy(field: keyof QuotePreviewCopy, value: string) {
    setPreviewCopy((current) => ({ ...current, [field]: value }));
  }

  return (
    <form action={createQuoteDraft} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <input type="hidden" name="client_mode" value={clientMode} />
      <input type="hidden" name="existing_client_id" value={existingClientId} />
      <input type="hidden" name="tags" value={selectedTagNames.join(",")} />
      <input type="hidden" name="source_lead_id" value={initialLead?.id ?? ""} />
      <input type="hidden" name="currency_code" value={quoteCurrency} />
      <input type="hidden" name="plan_chosen" value={recommendedPlan} />
      <input type="hidden" name="recommended_plan" value={recommendedPlan} />
      <input type="hidden" name="include_prepaid_plan" value={String(includePrepaidPlan)} />
      <input type="hidden" name="include_postpaid_plan" value={String(includePostpaidPlan)} />
      <input type="hidden" name="state_id" value={stateId} />
      <input type="hidden" name="service_ids" value={JSON.stringify(selectedServiceIds)} />
      <input type="hidden" name="service_fee_overrides" value={JSON.stringify(serviceFeeOverrides)} />
      <input type="hidden" name="custom_service_items" value={JSON.stringify(customServices)} />
      <input type="hidden" name="addon_items" value={JSON.stringify(addons)} />
      <input type="hidden" name="other_fee_items" value={JSON.stringify(otherFees)} />
      <input type="hidden" name="document_items" value={JSON.stringify(visibleDocumentItems)} />
      <input type="hidden" name="canned_note_items" value={JSON.stringify(selectedCannedMessages)} />
      <input type="hidden" name="preview_overrides" value={JSON.stringify(previewCopy)} />
      {showServiceBreakup ? <input type="hidden" name="show_service_breakup" value="true" /> : null}

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeButton active={clientMode === "new"} onClick={() => setClientMode("new")} title="New client" text="Create a fresh record." />
              <ModeButton active={clientMode === "existing"} onClick={() => setClientMode("existing")} title="Existing client" text="Use saved or synced data." />
            </div>

            {clientMode === "existing" ? (
              <div className="grid gap-2">
                <Field label="Search existing client">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                    <Input className="pl-9" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Name, client code, group ID" />
                  </div>
                </Field>
                <div className="max-h-56 overflow-y-auto rounded-md border border-[#e6ebdc] bg-white">
                  {matchingClients.length ? (
                    matchingClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setExistingClientId(client.id);
                          setClientSearch(client.name);
                          setSelectedTagNames(
                            (client.tags ?? [])
                              .map((tag) => normalizeTagName(tag))
                              .filter((tag) => tagLabelMap.has(tag))
                          );
                        }}
                        className={`block w-full border-b border-[#e6ebdc] px-3 py-2 text-left text-sm last:border-b-0 ${
                          existingClientId === client.id ? "bg-[#edf7df]" : "hover:bg-[#fbfcf8]"
                        }`}
                      >
                        <span className="font-black">{client.name}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {client.code} - Group {client.group_id || "not set"} - {client.client_type || "type not set"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-xs text-neutral-500">
                      {clientSearch.trim()
                        ? "No clients match this search."
                        : "Type a name, client code, or group ID to find a client."}
                      <button
                        type="button"
                        onClick={() => setClientMode("new")}
                        className="ml-1 font-black text-[#6a912f] underline"
                      >
                        Create a new client instead
                      </button>
                      .
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Client name">
                  <Input name="client_name" required={clientMode === "new"} value={clientName} onChange={(event) => setClientName(event.target.value)} />
                </Field>
                <Field label="Company name">
                  <Input name="company_name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Optional company / business name" />
                </Field>
                <Field label="Client ID">
                  <Input name="client_code" placeholder="Blank creates a temporary ID" />
                </Field>
                <Field label="Group ID">
                  <Input name="group_id" placeholder="Optional group / owner code" />
                </Field>
                <Field label="Client type">
                  <Select name="client_type" defaultValue="First-time Founder">
                    <option>First-time Founder</option>
                    <option>Small Business</option>
                    <option>NRI</option>
                    <option>Foreigner</option>
                    <option>Corporate</option>
                  </Select>
                </Field>
                <Field label="Email">
                  <Input
                    name="primary_email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    spellCheck={false}
                    defaultValue={initialLead?.email ?? ""}
                    placeholder="client@example.com"
                  />
                </Field>
                <Field label="Secondary email">
                  <Input
                    name="secondary_email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="optional@example.com"
                  />
                </Field>
                <Field label="Mobile">
                  <Input
                    name="primary_mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={primaryMobile}
                    onChange={(event) => setPrimaryMobile(event.target.value)}
                    placeholder="+91 ..."
                  />
                </Field>
                <Field label="Secondary mobile">
                  <Input
                    name="secondary_mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={secondaryMobile}
                    onChange={(event) => setSecondaryMobile(event.target.value)}
                    placeholder="+91 ..."
                  />
                </Field>
                <Field label="Source">
                  <Select name="source" value={source} onChange={(event) => setSource(event.target.value)}>
                    <option>Office Manual</option>
                    <option>Website Form</option>
                    <option>Meta</option>
                    <option>Google Form</option>
                    <option>WhatsApp</option>
                    <option>Referral</option>
                    <option>Existing Client</option>
                  </Select>
                </Field>
                <Field label="Validity days">
                  <Input name="validity_days" type="number" min="1" max="60" defaultValue="15" />
                </Field>
              </div>
            )}

            {clientMode === "existing" ? (
              <Field label="Company name">
                <Input name="company_name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Optional company / business name" />
              </Field>
            ) : null}

            <Field label="Quote currency" hint="One quotation uses one currency. Services shown below are filtered to match this choice.">
              <Select value={quoteCurrency} onChange={(event) => changeQuoteCurrency(event.target.value as SupportedCurrencyCode)}>
                {supportedCurrencyOptions.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </Select>
            </Field>
            {currencyChangeNotice ? (
              <p
                role="status"
                aria-live="polite"
                className="rounded-md border border-[#f0d896] bg-[#fff7df] px-3 py-2 text-xs font-semibold text-[#7a5200]"
              >
                {currencyChangeNotice}
              </p>
            ) : null}

            <Field label="Tags" hint={definedTags.length ? "Choose from the defined tag list." : "Add tags from Pipeline Setup first."}>
              <div className="grid gap-2">
                <div className="flex min-h-11 flex-wrap gap-2 rounded-md border border-[#d9ded1] bg-white p-2">
                  {selectedTagNames.length ? (
                    selectedTagNames.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-[#edf7df] px-2.5 py-1 text-xs font-black text-[#47651d]"
                        onClick={() => setSelectedTagNames((current) => current.filter((item) => item !== tag))}
                      >
                        {tagLabelMap.get(tag) ?? tag}
                        <span className="text-[#7d9855]">x</span>
                      </button>
                    ))
                  ) : (
                    <span className="px-1 py-1 text-xs text-neutral-500">No tags selected.</span>
                  )}
                </div>
                <Select
                  defaultValue=""
                  disabled={!definedTags.length}
                  onChange={(event) => {
                    const value = event.target.value;
                    event.target.value = "";
                    if (!value) return;
                    setSelectedTagNames((current) => (current.includes(value) ? current : [...current, value]));
                  }}
                >
                  <option value="">Add tag</option>
                  {groupedDefinedTags.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.tags.map((tag) => (
                        <option key={tag.id} value={normalizeTagName(tag.name)}>
                          {tag.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            </Field>
            {clientMode === "new" ? (
              <label className="flex items-center gap-2 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-xs font-bold text-neutral-700">
                <input name="whatsapp_consent" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                Client gave WhatsApp consent
              </label>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Services</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">Compact picker for a large service catalog.</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <Field label="Search">
                <Input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="GST, LLP, trademark..." />
              </Field>
              <Field label="Category">
                <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border border-[#e6ebdc] bg-white">
              {visibleServices.map((service) => (
                <label
                  key={service.id}
                  className={`grid cursor-pointer gap-2 border-b border-[#e6ebdc] p-3 text-sm transition last:border-b-0 sm:grid-cols-[24px_1fr_auto] sm:items-center ${
                    selectedServiceIds.includes(service.id) ? "bg-[#edf7df]" : "hover:bg-[#fbfcf8]"
                  }`}
                >
                  <input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleService(service.id)} className="mt-1 h-4 w-4 sm:mt-0" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-black">{service.name}</span>
                      <StatusPill>{service.category}</StatusPill>
                      <StatusPill>{service.currency_code}</StatusPill>
                    </span>
                    <span className="mt-1 block truncate text-xs text-neutral-600">{service.short_description}</span>
                  </span>
                  <span className="text-xs font-black text-neutral-700 sm:text-right">
                    {service.pricing_mode === "retainership"
                      ? `${formatCurrency(service.retainership_fee, quoteCurrency)} / ${formatRetainershipUnit(service.retainership_cycle)}`
                      : `${formatCurrency(service.prepaid_fee, quoteCurrency)} / ${formatCurrency(service.postpaid_fee, quoteCurrency)}`}
                    {(serviceFeeOverrides[service.id]?.quantity ?? 1) > 1
                      ? ` x ${formatUnitCount(serviceFeeOverrides[service.id]?.quantity ?? 1, normalizeUnitBasis(serviceFeeOverrides[service.id]?.unit_label))}`
                      : ""}
                  </span>
                </label>
              ))}
              {!visibleServices.length ? <div className="p-4 text-center text-sm text-neutral-500">No services match this search.</div> : null}
            </div>
            {!showAllServices && !serviceSearch && !categoryFilter && services.length > 8 ? (
              <Button type="button" variant="ghost" onClick={() => setShowAllServices(true)}>
                Show all {filteredServices.length} {quoteCurrency} services
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <CompactSection title="Custom service" meta={`${customServices.length} lines`}>
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCustomServices((current) => [...current, { name: "", description: "", prepaid_fee: 0, postpaid_fee: 0, required_documents: "" }])}
            >
              <Plus className="h-4 w-4" />
              Add custom service
            </Button>
            {customServices.map((service, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_40px]">
                  <Input value={service.name} onChange={(event) => updateCustomService(index, { name: event.target.value })} placeholder="Service name" />
                  <Input value={service.prepaid_fee || ""} onChange={(event) => updateCustomService(index, { prepaid_fee: Number(event.target.value) })} type="number" min="0" placeholder="Prepaid" />
                  <Input value={service.postpaid_fee || ""} onChange={(event) => updateCustomService(index, { postpaid_fee: Number(event.target.value) })} type="number" min="0" placeholder="Postpaid" />
                  <IconButton label="Remove custom service" onClick={() => setCustomServices((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                </div>
                <p className="text-[11px] font-black uppercase text-neutral-500">{quoteCurrency} custom line</p>
                <Textarea className="min-h-16" value={service.required_documents ?? ""} onChange={(event) => updateCustomService(index, { required_documents: event.target.value })} placeholder="Documents required for this custom service" />
              </div>
            ))}
          </div>
        </CompactSection>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Fees</CardTitle>
          </CardHeader>
          <CardContent>
            {serviceLines.length || retainershipLines.length ? (
              <div className="space-y-3">
                {serviceLines.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#f9fbf3] text-left">
                          <th className="border border-[#e6ebdc] p-2">Service</th>
                          <th className="border border-[#e6ebdc] p-2">Qty / basis</th>
                          <th className="border border-[#e6ebdc] p-2">Prepaid / basis</th>
                          <th className="border border-[#e6ebdc] p-2">Postpaid / basis</th>
                          <th className="border border-[#e6ebdc] p-2">1st installment / basis</th>
                          <th className="border border-[#e6ebdc] p-2">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fixedServicesWithFees.map((service) => (
                          <tr key={service.id}>
                            <td className="border border-[#e6ebdc] p-2 font-bold">{service.name}</td>
                            <td className="border border-[#e6ebdc] p-2">
                              <div className="grid gap-2">
                                <Input type="number" min="1" step="1" value={service.quantity} onChange={(event) => updateServiceFee(service, "quantity", Number(event.target.value))} onBlur={() => finalizeServiceFee(service.id)} />
                                <Select value={service.unit_label} onChange={(event) => updateServiceFee(service, "unit_label", event.target.value as UnitBasis)}>
                                  {unitBasisOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            </td>
                            <td className="border border-[#e6ebdc] p-2">
                              <Input type="number" min="0" value={service.prepaid_fee} onChange={(event) => updateServiceFee(service, "prepaid_fee", Number(event.target.value))} />
                              <p className="mt-1 text-[11px] text-neutral-500">Per {formatUnitBasisLabel(service.unit_label)}</p>
                            </td>
                            <td className="border border-[#e6ebdc] p-2">
                              <Input
                                type="number"
                                min="0"
                                value={service.postpaid_fee}
                                onChange={(event) => updateServiceFee(service, "postpaid_fee", Number(event.target.value))}
                                onBlur={() => finalizeServiceFee(service.id)}
                              />
                              <p className="mt-1 text-[11px] text-neutral-500">Per {formatUnitBasisLabel(service.unit_label)}</p>
                            </td>
                            <td className="border border-[#e6ebdc] p-2">
                              <Input
                                type="number"
                                min="0"
                                max={service.postpaid_fee}
                                value={Math.max(0, Number(service.first_installment ?? 0))}
                                onChange={(event) => updateServiceFee(service, "first_installment", Number(event.target.value))}
                                onBlur={() => finalizeServiceFee(service.id)}
                              />
                              <p className="mt-1 text-[11px] text-neutral-500">Per {formatUnitBasisLabel(service.unit_label)}</p>
                            </td>
                            <td className="border border-[#e6ebdc] p-2 font-bold text-neutral-600">
                              <div>{formatCurrency(service.quantity * service.postpaid_fee, quoteCurrency)}</div>
                              <div className="text-[11px] font-normal text-neutral-500">
                                2nd installment: {formatCurrency(service.quantity * Math.max(0, service.postpaid_fee - Math.max(0, Number(service.first_installment ?? 0))), quoteCurrency)}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {customServices.map((service, index) => (
                          <tr key={`custom-fee-${index}`}>
                            <td className="border border-[#e6ebdc] p-2 font-bold">{service.name || "Custom service"}</td>
                            <td className="border border-[#e6ebdc] p-2 text-neutral-400">1</td>
                            <td className="border border-[#e6ebdc] p-2">{formatCurrency(service.prepaid_fee, quoteCurrency)}</td>
                            <td className="border border-[#e6ebdc] p-2">{formatCurrency(service.postpaid_fee, quoteCurrency)}</td>
                            <td className="border border-[#e6ebdc] p-2 text-neutral-400">--</td>
                            <td className="border border-[#e6ebdc] p-2 text-neutral-400">{formatCurrency(service.postpaid_fee, quoteCurrency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {retainershipLines.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#f9fbf3] text-left">
                          <th className="border border-[#e6ebdc] p-2">Retainership service</th>
                          <th className="border border-[#e6ebdc] p-2">Qty / basis</th>
                          <th className="border border-[#e6ebdc] p-2">Billing cycle</th>
                          <th className="border border-[#e6ebdc] p-2">Recurring fee / basis</th>
                          <th className="border border-[#e6ebdc] p-2">Recurring total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retainershipServicesWithFees.map((service) => (
                          <tr key={`retainership-${service.id}`}>
                            <td className="border border-[#e6ebdc] p-2 font-bold">{service.name}</td>
                            <td className="border border-[#e6ebdc] p-2">
                              <div className="grid gap-2">
                                <Input type="number" min="1" step="1" value={service.quantity} onChange={(event) => updateServiceFee(service, "quantity", Number(event.target.value))} onBlur={() => finalizeServiceFee(service.id)} />
                                <Select value={service.unit_label} onChange={(event) => updateServiceFee(service, "unit_label", event.target.value as UnitBasis)}>
                                  {unitBasisOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            </td>
                            <td className="border border-[#e6ebdc] p-2">{formatRetainershipCycle(service.retainership_cycle)}</td>
                            <td className="border border-[#e6ebdc] p-2">
                              <Input
                                type="number"
                                min="0"
                                value={service.retainership_fee}
                                onChange={(event) => updateServiceFee(service, "retainership_fee", Number(event.target.value))}
                                onBlur={() => finalizeServiceFee(service.id)}
                              />
                              <p className="mt-1 text-[11px] text-neutral-500">
                                Per {formatUnitBasisLabel(service.unit_label)}. Charged every {formatRetainershipUnit(service.retainership_cycle)}.
                              </p>
                            </td>
                            <td className="border border-[#e6ebdc] p-2 font-bold text-neutral-600">
                              {formatCurrency(service.quantity * service.retainership_fee, quoteCurrency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[#d9ded1] p-4 text-sm text-neutral-500">Select or write a service to edit fees.</div>
            )}
          </CardContent>
        </Card>

        <CompactSection title="Documents for this quote" meta={`${visibleDocumentItems.length} items`} defaultOpen>
          <div className="grid gap-3">
            {documentGroups.length ? (
              <div className="max-h-72 overflow-y-auto rounded-md border border-[#e6ebdc] bg-white">
                {documentGroups.map((group) => (
                  <section key={group.title} className="border-b border-[#e6ebdc] last:border-b-0">
                    <div className="bg-[#fbfcf8] px-3 py-2 text-xs font-black text-black">{group.title}</div>
                    <div className="divide-y divide-[#e6ebdc]">
                      {group.items.map((document) => (
                        <div key={document.id} className="grid gap-2 px-3 py-2 md:grid-cols-[1fr_36px]">
                          {document.kind === "break" ? (
                            <div className="flex min-h-11 items-center rounded-md border border-dashed border-[#d9ded1] px-3 text-xs font-black uppercase text-neutral-400">
                              Paragraph break
                            </div>
                          ) : (
                            <div className="grid gap-1">
                              {document.kind === "heading" ? <p className="text-[11px] font-black uppercase text-[#6a912f]">Subheading</p> : null}
                              <Input value={document.label} onChange={(event) => updateDocumentItem(document, event.target.value)} />
                            </div>
                          )}
                          <IconButton label="Remove document" onClick={() => removeDocumentItem(document)} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[#d9ded1] p-4 text-sm text-neutral-500">Select a service or add a custom document.</div>
            )}
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Textarea
                className="min-h-20"
                value={customDocument}
                onChange={(event) => setCustomDocument(event.target.value)}
                placeholder={"Use `# Directors` for a bold subheading.\nPress Enter for a new line.\nLeave a blank line for a paragraph break."}
              />
              <Button type="button" variant="ghost" onClick={addCustomDocument}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <p className="text-xs text-neutral-500">Use `# Subheading` for bold text. Press Enter for a new line. Leave one blank line for a paragraph break.</p>
          </div>
        </CompactSection>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Commercials and notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input type="checkbox" checked={showServiceBreakup} onChange={(event) => setShowServiceBreakup(event.target.checked)} className="h-4 w-4" />
                Show service-wise price breakup
              </label>
            </div>

            <div className="grid gap-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
              <p className="text-sm font-black text-black">Plans shown</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input type="checkbox" checked={includePrepaidPlan} onChange={(event) => setPlanVisibility("prepaid", event.target.checked)} className="h-4 w-4" />
                  Prepaid
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input type="checkbox" checked={includePostpaidPlan} onChange={(event) => setPlanVisibility("postpaid", event.target.checked)} className="h-4 w-4" />
                  Postpaid
                </label>
              </div>
              <Field label="Recommended">
                <Select value={recommendedPlan} onChange={(event) => setRecommendedPlan(event.target.value as Extract<QuotePlan, "prepaid" | "postpaid">)}>
                  {includePostpaidPlan ? <option value="postpaid">Postpaid recommended</option> : null}
                  {includePrepaidPlan ? <option value="prepaid">Prepaid recommended</option> : null}
                </Select>
              </Field>
            </div>

            <Field label="State">
              <Select value={stateId} onChange={(event) => setStateId(event.target.value)}>
                <option value="">Select state</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name} {state.surcharge ? `+ ${formatCurrency(state.surcharge, quoteCurrency)}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <LineEditor title="Add-ons" buttonLabel="Add line" onAdd={() => setAddons((current) => [...current, { description: "", amount: 0 }])}>
              {addonTemplates.length ? (
                <div className="flex flex-wrap gap-2 rounded-md border border-[#e6ebdc] bg-white p-2">
                  {addonTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setAddons((current) => [...current, { description: template.name, amount: template.postpaid_fee || template.prepaid_fee }])}
                      className="rounded-md border border-[#d9ded1] px-2 py-1 text-xs font-bold hover:border-[#a0ce4e]"
                    >
                      {template.name} ({template.currency_code})
                    </button>
                  ))}
                </div>
              ) : null}
              {addons.map((addon, index) => (
                <LineItem key={index} description={addon.description} amount={addon.amount} amountMin={0} onDescription={(description) => updateAddon(index, { description })} onAmount={(amount) => updateAddon(index, { amount })} onRemove={() => setAddons((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
              ))}
            </LineEditor>

            <LineEditor title="Other fees / adjustments" buttonLabel="Add adjustment" onAdd={() => setOtherFees((current) => [...current, { description: "", amount: 0 }])}>
              <p className="text-xs text-neutral-500">Use positive amounts for government fees or reimbursements. Use negative amounts for extra discount.</p>
              {otherFees.map((fee, index) => (
                <LineItem key={index} description={fee.description} amount={fee.amount} onDescription={(description) => updateOtherFee(index, { description })} onAmount={(amount) => updateOtherFee(index, { amount })} onRemove={() => setOtherFees((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
              ))}
            </LineEditor>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Discount">
                <Input name="discount_amount" type="number" min="0" value={discountAmount || ""} onChange={(event) => setDiscountAmount(Number(event.target.value))} />
              </Field>
              <Field label="GST rate %">
                <Input name="gst_rate_percent" type="number" min="0" max="100" step="0.01" value={gstRatePercent || ""} onChange={(event) => setGstRatePercent(Number(event.target.value))} />
              </Field>
              <Field label="GST base amount" hint="Blank means calculated value.">
                <Input name="gst_base_amount" type="number" min="0" value={gstBaseAmount} onChange={(event) => setGstBaseAmount(event.target.value)} placeholder="Editable" />
              </Field>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                <div>
                  <p className="text-sm font-black text-black">Canned notes</p>
                  <p className="text-xs text-neutral-500">Add saved wording without crowding the editor.</p>
                </div>
                <Select value={cannedCategoryFilter} onChange={(event) => setCannedCategoryFilter(event.target.value)}>
                  <option value="">All categories</option>
                  {cannedCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </Select>
              </div>
              {filteredCannedMessages.length ? (
                <div className="flex flex-wrap gap-2 rounded-md border border-[#e6ebdc] bg-white p-2">
                  {filteredCannedMessages.map((message) => (
                    <button key={message.id} type="button" onClick={() => addCannedMessage(message)} className="rounded-md border border-[#d9ded1] px-2 py-1 text-xs font-bold hover:border-[#a0ce4e]">
                      {message.title}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedCannedMessages.map((message) => (
                <div key={message.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black text-black">{message.title}</p>
                    <IconButton label="Remove saved note" onClick={() => setSelectedCannedMessages((current) => current.filter((item) => item.id !== message.id))} />
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-600">{message.body}</p>
                </div>
              ))}
            </div>

            <Field label="Custom note">
              <Textarea className="min-h-20" name="custom_note" value={customNote} onChange={(event) => setCustomNote(event.target.value)} placeholder="Optional client-facing note" />
            </Field>
          </CardContent>
        </Card>

        <CompactSection title="Editable quote text" meta="Advanced" defaultOpen={false}>
          <div className="grid gap-3">
            <Field label="Greeting line">
              <Input value={previewCopy.greeting} onChange={(event) => updatePreviewCopy("greeting", event.target.value)} />
            </Field>
            <Field label="Validity text">
              <Textarea className="min-h-20" value={previewCopy.validity} onChange={(event) => updatePreviewCopy("validity", event.target.value)} />
            </Field>
            <Field label="Professional fees note">
              <Input value={previewCopy.investmentNote} onChange={(event) => updatePreviewCopy("investmentNote", event.target.value)} />
            </Field>
            <Field label="What's included note">
              <Input value={previewCopy.includedNote} onChange={(event) => updatePreviewCopy("includedNote", event.target.value)} />
            </Field>
            <Field label="Refund policy">
              <Textarea className="min-h-20" value={previewCopy.refundPolicy} onChange={(event) => updatePreviewCopy("refundPolicy", event.target.value)} />
            </Field>
            <Field label="Who we are">
              <Textarea className="min-h-20" value={previewCopy.whoWeAre} onChange={(event) => updatePreviewCopy("whoWeAre", event.target.value)} />
            </Field>
            <Field label="Who we are subtext">
              <Textarea className="min-h-20" value={previewCopy.whoWeAreSubtext} onChange={(event) => updatePreviewCopy("whoWeAreSubtext", event.target.value)} />
            </Field>
            <Field label="Footer question line">
              <Input value={previewCopy.signatureQuestion} onChange={(event) => updatePreviewCopy("signatureQuestion", event.target.value)} />
            </Field>
          </div>
        </CompactSection>
      </div>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Quotation preview</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">Grouped documents and compact pricing keep the quote readable.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-[#e5e5e5] bg-white">
              <div className="flex items-start justify-between bg-black p-5 text-white">
                <div>
                  <p className="text-xl font-black">
                    <span className="text-[#a0ce4e]">Company</span>ji
                  </p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-normal text-[#a0ce4e]">
                    India&apos;s #1 rated Startup Consultant
                  </p>
                </div>
                <p className="text-right text-xs leading-5">
                  <span className="text-[#a0ce4e]">Quotation</span>
                  <br />
                  Draft
                </p>
              </div>

              <div className="space-y-5 p-5">
                <div>
                  <p className="text-sm">Dear {firstName(displayClientName)},</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {previewCopy.greeting} {quoteServiceLabel}.
                  </p>
                  {companyName.trim() || previewMobileNumber.trim() ? (
                    <div className="mt-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] px-3 py-2 text-xs leading-5 text-neutral-600">
                      {companyName.trim() ? (
                        <p>
                          <span className="font-black text-black">Company Name:</span> {companyName.trim()}
                        </p>
                      ) : null}
                      {previewMobileNumber.trim() ? (
                        <p>
                          <span className="font-black text-black">Mobile Number:</span> {previewMobileNumber.trim()}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-l-4 border-[#a0ce4e] bg-[#f9fbf3] p-4">
                  <p className="text-[11px] font-black uppercase tracking-normal text-[#6b8a3a]">What we will deliver</p>
                  <p className="mt-2 font-black text-black">{serviceNames.length ? quoteServiceLabel : "Select services"}</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {selectedServices[0]?.short_description || customServices[0]?.description || "The selected scope will appear here."}
                  </p>
                </div>

                <p className="text-xs italic leading-5 text-neutral-500">{previewCopy.validity}</p>

                <div>
                  <p className="text-[11px] font-black uppercase tracking-normal text-neutral-500">01 - Professional Fees</p>
                  <h3 className="mt-1 text-xl font-black">{pricingHeading}</h3>
                  <p className="text-xs text-neutral-500">{previewCopy.investmentNote}</p>
                </div>

                {hasPlanPricing ? (
                  <div className={`grid gap-3 ${includePrepaidPlan && includePostpaidPlan ? "md:grid-cols-2" : ""}`}>
                    {includePrepaidPlan ? (
                      <PlanCard title="Prepaid" amount={twoPlanPricing.prepaid.totalAmount} text={prepaidPlanText} recommended={recommendedPlan === "prepaid"} currencyCode={quoteCurrency} />
                    ) : null}
                    {includePostpaidPlan ? (
                      <PlanCard title="Postpaid" amount={twoPlanPricing.postpaid.totalAmount} text={postpaidPlanText} recommended={recommendedPlan === "postpaid"} currencyCode={quoteCurrency} />
                    ) : null}
                  </div>
                ) : null}

                {showServiceBreakup && serviceLines.length ? (
                  <PreviewTable
                    headers={[
                      "Service",
                      "Qty",
                      ...(includePrepaidPlan ? ["Prepaid"] : []),
                      ...(includePostpaidPlan ? ["Postpaid"] : [])
                    ]}
                    rows={serviceLines.map((line) => [
                      line.name,
                      formatUnitCount(line.quantity, line.unit_label),
                      ...(includePrepaidPlan ? [formatCurrency(line.prepaid_total, quoteCurrency)] : []),
                      ...(includePostpaidPlan ? [formatCurrency(line.postpaid_total, quoteCurrency)] : [])
                    ])}
                  />
                ) : null}

                {hasRetainershipPricing ? (
                  <PreviewTable
                    headers={["Retainership service", "Qty", "Billing cycle", "Recurring total"]}
                    rows={retainershipLines.map((line) => [
                      line.name,
                      formatUnitCount(line.quantity, line.unit_label),
                      formatRetainershipCycle(line.cycle),
                      formatCurrency(line.retainership_total, quoteCurrency)
                    ])}
                  />
                ) : null}

                {planTermLines.length ? (
                  <PreviewTable
                    headers={[
                      "Service terms",
                      ...(includePrepaidPlan ? ["Prepaid"] : []),
                      ...(includePostpaidPlan ? ["Postpaid"] : [])
                    ]}
                    rows={planTermLines.map((line) => [
                      line.name,
                      ...(includePrepaidPlan ? [line.prepaid_description] : []),
                      ...(includePostpaidPlan ? [line.postpaid_description] : [])
                    ])}
                  />
                ) : null}

                <div className="rounded-md border border-[#e6ebdc] bg-white p-4 text-sm">
                  {hasPlanPricing ? <AmountLine label="Recommended total" amount={recommendedPricing.totalAmount} currencyCode={quoteCurrency} /> : null}
                  {hasStateVariation || visibleAddons.length || visibleOtherFees.length ? (
                    <>
                      {hasStateVariation ? <AmountLine label={`State variation${selectedState ? ` - ${selectedState.name}` : ""}`} amount={recommendedPricing.stateVariationAdd} currencyCode={quoteCurrency} /> : null}
                      {visibleAddons.map((addon, index) => <AmountLine key={`${addon.description}-${index}`} label={`Add-on - ${addon.description || "Untitled"}`} amount={addon.amount} currencyCode={quoteCurrency} />)}
                      {visibleOtherFees.map((fee, index) => <AmountLine key={`${fee.description}-${index}`} label={fee.description || "Other adjustment"} amount={fee.amount} currencyCode={quoteCurrency} />)}
                    </>
                  ) : null}
                  {recommendedPricing.discountAmount !== 0 ? <AmountLine label="Discount" amount={-recommendedPricing.discountAmount} currencyCode={quoteCurrency} /> : null}
                  {recommendedPricing.gstAmount !== 0 ? <AmountLine label={`GST @ ${recommendedPricing.gstRatePercent}%`} amount={recommendedPricing.gstAmount} currencyCode={quoteCurrency} /> : null}
                  <div className="mt-3 flex items-center justify-between border-t border-[#e6ebdc] pt-3 font-black">
                    <span>Total</span>
                    <span>{formatCurrency(recommendedPricing.totalAmount, quoteCurrency)}</span>
                  </div>
                </div>

                {noteBodies.length ? (
                  <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm leading-6 text-neutral-700">
                    {noteBodies.map((note, index) => <p key={`${note}-${index}`} className="mb-3 last:mb-0">{note}</p>)}
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] font-black uppercase tracking-normal text-neutral-500">02 - What is included</p>
                  <p className="mt-1 text-sm text-neutral-600">{previewCopy.includedNote}</p>
                  <div className="mt-3 rounded-md border border-[#e6ebdc] p-4 text-sm leading-6 text-neutral-700">
                    {inclusions.length ? (
                      inclusions.map((service) => (
                        <div key={service.id} className="mb-3 last:mb-0">
                          <p className="font-black text-black">{service.name}</p>
                          <RichTextContent className="mt-2" value={service.inclusions} />
                        </div>
                      ))
                    ) : (
                      <p>Select services to see inclusions.</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-black uppercase tracking-normal text-neutral-500">03 - What we need from you</p>
                  <div className="mt-3 rounded-md border border-[#e6ebdc] p-4 text-sm leading-6 text-neutral-700">
                    {documentGroups.length ? (
                      <div className="grid gap-4">
                        {documentGroups.map((group) => (
                          <div key={group.title}>
                            <p className="font-black text-black">{group.title}</p>
                            <div className="mt-2">{renderBuilderDocumentLines(group.title, group.items)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>Select services to see document requirements.</p>
                    )}
                  </div>
                </div>

                {serviceDetailCards.length ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-black uppercase tracking-normal text-neutral-500">04 - Service note and timeline</p>
                    {serviceDetailCards.map((service) => (
                      <div key={service.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm leading-6 text-neutral-700">
                        <p className="font-black text-black">{service.name}</p>
                        {service.quantity > 1 ? (
                          <p className="mt-1 text-xs font-bold uppercase text-neutral-500">{formatUnitCount(service.quantity, service.unitLabel)} selected</p>
                        ) : null}
                        {service.description ? (
                          <div className="mt-2">
                            <span className="font-black text-black">Note:</span>
                            <RichTextContent className="mt-2" value={service.description} />
                          </div>
                        ) : null}
                        {service.timelineTypical ? (
                          <p className="mt-2">
                            <span className="font-black text-black">Typical timeline:</span> {service.timelineTypical}
                          </p>
                        ) : null}
                        {service.pricingMode === "retainership" ? (
                          <p className="mt-2">
                            <span className="font-black text-black">Retainership fee:</span>{" "}
                            {formatCurrency(service.retainershipDisplayFee ?? service.retainershipFee ?? 0, quoteCurrency)} / {formatRetainershipUnit(service.retainershipCycle)}
                          </p>
                        ) : null}
                        {includePostpaidPlan && service.pricingMode !== "retainership" && service.firstInstallment ? (
                          <p className="mt-2">
                            <span className="font-black text-black">In case of Postpaid - First installment:</span> {formatCurrency(service.firstInstallment, quoteCurrency)}
                            {service.firstTrigger ? ` - ${service.firstTrigger}` : ""}
                          </p>
                        ) : null}
                        {includePostpaidPlan && service.pricingMode !== "retainership" && service.secondInstallment ? (
                          <p className="mt-1">
                            <span className="font-black text-black">In case of Postpaid - Second installment:</span> {formatCurrency(service.secondInstallment, quoteCurrency)}
                            {service.secondTrigger ? ` - ${service.secondTrigger}` : ""}
                          </p>
                        ) : null}
                        {service.extraCostsClause ? <p className="mt-2 text-xs text-neutral-500">{service.extraCostsClause}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] font-black uppercase tracking-normal text-neutral-500">05 - Refund policy</p>
                  <div className="mt-3 rounded-md border border-[#e6ebdc] bg-[#f9f9f9] p-4 text-sm leading-6 text-neutral-700">{previewCopy.refundPolicy}</div>
                </div>

                <div className="bg-black p-5 text-center text-white">
                  <p className="text-[10px] font-black uppercase tracking-normal text-[#a0ce4e]">Who we are</p>
                  <p className="mt-3 text-sm leading-6">{whoWeAreText}</p>
                </div>

                <div className="text-sm leading-6 text-neutral-700">
                  <p>{previewCopy.signatureQuestion} {footerSettings.whatsappPhone}.</p>
                  <p className="mt-4">Warm regards,</p>
                  <p className="font-black text-black">Team SBS</p>
                </div>

                <QuoteFooter settings={footerSettings} serviceName={quoteServiceLabel} />

                <div className="grid gap-2">
                  {submitDisabledReason ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className="rounded-md border border-[#f0d896] bg-[#fff7df] p-3 text-xs font-semibold text-[#7a5200]"
                    >
                      {submitDisabledReason}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    type="submit"
                    name="submit_intent"
                    value="draft"
                    disabled={submitDisabled}
                  >
                    Save as draft
                  </Button>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      className="w-full"
                      type="submit"
                      name="submit_intent"
                      value="email"
                      variant="ghost"
                      disabled={submitDisabled}
                    >
                      <Mail className="h-4 w-4" />
                      Send email
                    </Button>
                    <Button
                      className="w-full"
                      type="submit"
                      name="submit_intent"
                      value="whatsapp"
                      variant="ghost"
                      disabled={submitDisabled}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp / PDF
                    </Button>
                  </div>
                  <Button
                    className="w-full"
                    type="submit"
                    name="submit_intent"
                    value="all"
                    variant="secondary"
                    disabled={submitDisabled}
                  >
                    <Send className="h-4 w-4" />
                    Send email + WhatsApp
                  </Button>
                  <p className="text-xs leading-5 text-neutral-500">
                    WhatsApp opens the ready brief and PDF sheet. Automatic WhatsApp sending can be connected after AiSensy templates are ready.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function splitChecklist(value: string) {
  return parseStructuredDocumentText(value);
}

const unitBasisOptions: { value: UnitBasis; label: string }[] = [
  { value: "units", label: "Units" },
  { value: "year", label: "Year" },
  { value: "nos", label: "Nos" }
];

function normalizeUnitBasis(value: unknown): UnitBasis {
  return value === "year" || value === "nos" ? value : "units";
}

function formatUnitBasisLabel(unitLabel: UnitBasis) {
  return unitLabel === "year" ? "year" : unitLabel === "nos" ? "nos" : "unit";
}

function formatUnitCount(quantity: number, unitLabel: UnitBasis) {
  if (unitLabel === "year") {
    return `${quantity} ${quantity === 1 ? "Year" : "Years"}`;
  }

  if (unitLabel === "nos") {
    return `${quantity} Nos`;
  }

  return `${quantity} ${quantity === 1 ? "Unit" : "Units"}`;
}

function formatServiceLabel(name: string, quantity: number, unitLabel: UnitBasis) {
  return quantity > 1 ? `${name} (${formatUnitCount(quantity, unitLabel)})` : name;
}

function buildNextServiceOverride(
  current: ServiceFeeOverride | undefined,
  service: QuoteServiceOption,
  field: keyof ServiceFeeOverride,
  value: number | UnitBasis
): ServiceFeeOverride {
  const numericValue = typeof value === "number" ? value : Number.NaN;
  const safeValue = Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
  const baseRetainershipFee = Math.max(0, Number(service.retainership_fee ?? service.postpaid_fee ?? 0));
  const next: ServiceFeeOverride = {
    prepaid_fee: current?.prepaid_fee ?? service.prepaid_fee,
    postpaid_fee: current?.postpaid_fee ?? service.postpaid_fee,
    first_installment: current?.first_installment ?? Math.max(0, Number(service.first_installment ?? 0)),
    retainership_fee: current?.retainership_fee ?? baseRetainershipFee,
    quantity: current?.quantity ?? 1,
    unit_label: normalizeUnitBasis(current?.unit_label)
  };

  if (field === "quantity") {
    next.quantity = Math.max(1, safeValue);
  } else if (field === "unit_label") {
    next.unit_label = normalizeUnitBasis(value);
  } else {
    next[field] = safeValue;
  }

  if (service.pricing_mode === "retainership") {
    const nextRetainershipFee = field === "retainership_fee" || field === "prepaid_fee" || field === "postpaid_fee" ? safeValue : next.retainership_fee;
    return {
      prepaid_fee: nextRetainershipFee,
      postpaid_fee: nextRetainershipFee,
      first_installment: 0,
      retainership_fee: nextRetainershipFee,
      quantity: next.quantity,
      unit_label: next.unit_label
    };
  }

  if (field === "first_installment") {
    next.first_installment = Math.min(next.first_installment, next.postpaid_fee);
  }

  return next;
}

function clampServiceFeeOverride(override: ServiceFeeOverride): ServiceFeeOverride {
  const prepaidFee = Number.isFinite(override.prepaid_fee) ? Math.max(0, Math.round(override.prepaid_fee)) : 0;
  const postpaidFee = Number.isFinite(override.postpaid_fee) ? Math.max(0, Math.round(override.postpaid_fee)) : 0;
  const firstInstallment = Number.isFinite(override.first_installment) ? Math.max(0, Math.round(override.first_installment)) : 0;
  const retainershipFee = Number.isFinite(override.retainership_fee) ? Math.max(0, Math.round(override.retainership_fee)) : 0;
  const quantity = Number.isFinite(override.quantity) ? Math.max(1, Math.round(override.quantity)) : 1;
  const unitLabel = normalizeUnitBasis(override.unit_label);

  return {
    prepaid_fee: prepaidFee,
    postpaid_fee: postpaidFee,
    first_installment: Math.min(firstInstallment, postpaidFee),
    retainership_fee: retainershipFee,
    quantity,
    unit_label: unitLabel
  };
}

function groupDefinedTags(tags: QuoteDefinedTagOption[]) {
  const grouped = tags.reduce<Record<string, QuoteDefinedTagOption[]>>((groups, tag) => {
    groups[tag.category_name] = [...(groups[tag.category_name] ?? []), tag];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupTags]) => ({
      category,
      tags: groupTags.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function groupQuoteDocuments(documents: QuoteDocumentItem[]): DocumentGroup[] {
  const grouped = documents.reduce<Record<string, QuoteDocumentItem[]>>((groups, document) => {
    const title = document.serviceName || "Additional documents";
    groups[title] = [...(groups[title] ?? []), document];
    return groups;
  }, {});

  return Object.entries(grouped).map(([title, items]) => ({ title, items }));
}

function renderBuilderDocumentLines(groupTitle: string, items: QuoteDocumentItem[]) {
  return (
    <div className="space-y-1 text-sm leading-6 text-neutral-700">
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

function ModeButton({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition ${
        active ? "border-[#a0ce4e] bg-[#edf7df]" : "border-[#e6ebdc] bg-[#fbfcf8] hover:border-[#a0ce4e]"
      }`}
    >
      <span className="block text-sm font-black">{title}</span>
      <span className="mt-1 block text-xs text-neutral-600">{text}</span>
    </button>
  );
}

function CompactSection({
  title,
  meta,
  defaultOpen = false,
  children
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-[#d9ded1] bg-white shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-[#e6ebdc] px-5 py-3">
        <span className="font-bold text-black">{title}</span>
        {meta ? <span className="rounded-md bg-[#f4f4f4] px-2 py-1 text-xs font-black text-neutral-500">{meta}</span> : null}
      </summary>
      <div className="p-5">{children}</div>
    </details>
  );
}

function LineEditor({
  title,
  buttonLabel,
  onAdd,
  children
}: {
  title: string;
  buttonLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-black">{title}</p>
        <Button type="button" variant="ghost" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}

function LineItem({
  description,
  amount,
  amountMin,
  onDescription,
  onAmount,
  onRemove
}: {
  description: string;
  amount: number;
  amountMin?: number;
  onDescription: (value: string) => void;
  onAmount: (value: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 md:grid-cols-[1fr_140px_36px]">
      <Input value={description} onChange={(event) => onDescription(event.target.value)} placeholder="Description" />
      <Input value={amount || ""} onChange={(event) => onAmount(Number(event.target.value))} type="number" min={amountMin} placeholder="Amount" />
      <IconButton label="Remove line" onClick={onRemove} />
    </div>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="grid min-h-9 place-items-center rounded-md border border-[#d9ded1] bg-white text-[#b42318]"
      onClick={onClick}
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function PlanCard({
  title,
  amount,
  text,
  recommended,
  currencyCode
}: {
  title: string;
  amount: number;
  text: string;
  recommended?: boolean;
  currencyCode: string;
}) {
  return (
    <div className={`border p-4 ${recommended ? "border-[#a0ce4e] bg-[#f9fbf3]" : "border-[#e5e5e5] bg-white"}`}>
      <p className="text-[10px] font-black uppercase tracking-normal text-neutral-500">
        {title} {recommended ? <span className="ml-1 bg-[#a0ce4e] px-1.5 py-0.5 text-[9px] text-black">Recommended</span> : null}
      </p>
      <p className="mt-2 text-2xl font-black">{formatCurrency(amount, currencyCode)}</p>
      <p className="mt-3 text-xs leading-5 text-neutral-600">{text}</p>
    </div>
  );
}

function getPricingHeading(hasPlanPricing: boolean, includePrepaidPlan: boolean, includePostpaidPlan: boolean) {
  if (!hasPlanPricing) return "Retainership fees";
  if (includePrepaidPlan && includePostpaidPlan) return "Two ways to engage us";
  if (includePrepaidPlan) return "Prepaid professional fees";
  if (includePostpaidPlan) return "Postpaid professional fees";
  return "Professional fees";
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="bg-[#f9fbf3] text-left">
            {headers.map((header) => <th key={header} className="border border-[#e5e5e5] p-2">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className={`border border-[#e5e5e5] p-2 ${cellIndex === 0 ? "font-bold" : ""}`}>
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

function AmountLine({ label, amount, currencyCode }: { label: string; amount: number; currencyCode: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[#e6ebdc] bg-white p-3 text-sm">
      <span className="font-bold">{label}</span>
      <span className="font-black">{formatCurrency(amount, currencyCode)}</span>
    </div>
  );
}

function QuoteFooter({ settings, serviceName }: { settings: QuoteFooterSettings; serviceName: string }) {
  const items = [
    { label: settings.assistanceLabel, phone: settings.assistancePhone, href: buildPhoneCallHref(settings.assistancePhone) },
    { label: settings.consultancyLabel, phone: settings.consultancyPhone, href: buildPhoneCallHref(settings.consultancyPhone) },
    {
      label: settings.whatsappLabel,
      phone: settings.whatsappPhone,
      href: buildWhatsAppHref(settings.whatsappPhone, buildQuoteWhatsAppMessage(serviceName)),
      external: true
    }
  ];

  return (
    <div className="bg-black p-5 text-white">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="text-center sm:text-left">
            <p className="text-[10px] font-black uppercase tracking-normal text-neutral-500">{item.label}</p>
            {item.href ? (
              <a
                href={item.href}
                className="mt-1 inline-block text-sm font-black text-[#a0ce4e] underline-offset-2 hover:underline"
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
              >
                {item.phone}
              </a>
            ) : (
              <p className="mt-1 text-sm font-black text-[#a0ce4e]">{item.phone}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-[10px] uppercase tracking-normal text-neutral-500">{settings.footerLine}</p>
    </div>
  );
}
