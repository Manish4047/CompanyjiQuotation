import { ServiceList, type ServiceListItem } from "@/components/services/service-list";
import { ServiceDrawer } from "@/components/services/service-drawer";
import type { ServiceDocumentTemplateOption } from "@/components/services/service-create-form";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { canManageServices } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

type ServiceDocumentLink = {
  service_id: string;
  document_template_id: string;
};

/**
 * Services catalog. Phase 1 redesign — full-width compact list with a sticky
 * filter bar, and a slide-over drawer for both Add and Edit. The cramped 420px
 * left rail is gone; the drawer gives the form room to breathe.
 *
 * Data load is still server-side but slimmer: when very large catalogs become
 * a real problem, push the filter into SQL via .ilike / .eq so we don't pull
 * unchanged rows back on every keystroke. For now, client-side filtering on
 * the loaded set keeps the search instant.
 */
export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; category?: string; status?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data, error: servicesError },
    { data: documentTemplatesData, error: documentTemplatesError },
    { data: documentLinksData }
  ] = await Promise.all([
    supabase.from("services").select("*").order("category").order("name"),
    supabase.from("document_templates").select("id,name,category").order("category").order("name"),
    supabase.from("service_document_templates").select("service_id,document_template_id")
  ]);

  const documentLinks = (documentLinksData ?? []) as ServiceDocumentLink[];
  const selectedDocumentIdsByService = documentLinks.reduce<Record<string, string[]>>((grouped, link) => {
    grouped[link.service_id] = [...(grouped[link.service_id] ?? []), link.document_template_id];
    return grouped;
  }, {});
  const services = ((data ?? []) as Omit<ServiceListItem, "document_template_ids">[]).map((service) => ({
    ...service,
    document_template_ids: selectedDocumentIdsByService[service.id] ?? []
  }));
  const documentTemplates = (documentTemplatesData ?? []) as ServiceDocumentTemplateOption[];
  const categories = [...new Set(services.map((service) => service.category))].sort();
  const canManage = canManageServices(profile.role);

  const initialFilters = {
    q: params.q ?? "",
    category: params.category ?? "",
    status: params.status ?? ""
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Admin foundation</p>
          <h1 className="mt-1 text-3xl font-black text-black">Services catalog</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            The quote engine&apos;s source of truth. Services can be one-time, engagement-based, or retainership-based,
            and each carries its own documents, timeline, inclusions, and surcharge rules.
          </p>
        </div>
        {canManage ? (
          <ServiceDrawer documentTemplates={documentTemplates} categories={categories} />
        ) : (
          <p className="text-xs font-semibold text-neutral-500">
            View only — Admins can add or edit services.
          </p>
        )}
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}
      {servicesError ? <Notice tone="red">{friendlyReadError(servicesError.message)}</Notice> : null}
      {documentTemplatesError ? (
        <Notice tone="red">{friendlyReadError(documentTemplatesError.message)}</Notice>
      ) : null}

      <ServiceList
        services={services}
        documentTemplates={documentTemplates}
        categories={categories}
        canManage={canManage}
        initialFilters={initialFilters}
      />
    </div>
  );
}

function friendlyReadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("column") || lower.includes("schema cache")) {
    return "Services could not load because the database is missing newer service fields. Run 0002_quote_pricing_settings_and_google_sync.sql, 0003_quote_composer_libraries.sql, 0004_document_categories_and_compact_composer.sql, 0010_multi_currency.sql, and 0011_service_retainership.sql in Supabase SQL Editor.";
  }
  if (lower.includes("relation")) {
    return "A quotation library table is missing. Run 0003_quote_composer_libraries.sql and 0004_document_categories_and_compact_composer.sql in Supabase SQL Editor.";
  }
  return message;
}
