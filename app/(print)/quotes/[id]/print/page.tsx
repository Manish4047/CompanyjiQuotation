import { QuoteDocumentPreview } from "@/components/quotes/quote-document-preview";
import { QuotePrintActions } from "@/components/quotes/quote-print-actions";
import { requireProfile } from "@/lib/auth/session";
import type { QuoteRenderData } from "@/lib/quotes/render";
import { createAdminClient } from "@/lib/supabase/admin";

type PrintableQuote = QuoteRenderData & {
  client_id: string;
  status: string;
  clients: { name: string; client_type: string | null; source: string | null } | null;
};

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: quoteData }, { data: footerSettings }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id,quote_id_formatted,client_id,status,validity_date,currency_code,company_name_snapshot,client_mobile_snapshot,recommended_plan,show_service_breakup,include_prepaid_plan,include_postpaid_plan,prepaid_total_amount,postpaid_total_amount,state_variation_add,addon_items,addon_total,other_fee_items,other_fee_total,discount_amount,gst_rate_percent,gst_amount,total_amount,required_documents_snapshot,service_fee_overrides,document_items,custom_service_items,custom_note,clients(name,client_type,source),quotes_services(service_id,fee_snapshot,services(name,short_description,full_description,pricing_mode,currency_code,prepaid_fee,postpaid_fee,retainership_fee,retainership_cycle,prepaid_description,postpaid_description,inclusions,first_installment,first_trigger,second_trigger,timeline_typical,extra_costs_clause))"
      )
      .eq("id", id)
      .single(),
    supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle()
  ]);

  const quote = quoteData as unknown as PrintableQuote | null;

  if (!quote) {
    return (
      <main className="quote-pdf-page">
        <div className="mx-auto max-w-[210mm] rounded-lg bg-white p-6 font-bold">Quote not found.</div>
      </main>
    );
  }

  return (
    <main className="quote-pdf-page">
      <QuotePrintActions quoteId={quote.id} />
      <QuoteDocumentPreview quote={quote} footerSettings={footerSettings?.value} />
    </main>
  );
}

