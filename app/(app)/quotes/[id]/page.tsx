import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import {
  enrollQuoteInDripFromDetail,
  sendQuoteByEmail,
  updateQuoteDripEnrollmentStatus,
  updateQuoteStatusFromDetail
} from "@/app/(app)/quotes/actions";
import { loadQuoteComments } from "@/app/(app)/quotes/comments-actions";
import { CommentThread } from "@/components/comments/comment-thread";
import { QuoteDocumentPreview } from "@/components/quotes/quote-document-preview";
import { QuoteShareTools } from "@/components/quotes/quote-share-tools";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { canSendQuote } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/session";
import { buildWhatsAppBrief, getQuoteServiceNames, type QuoteRenderData } from "@/lib/quotes/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate, formatDateTime, maskEmail, maskMobile, quoteStatusTone } from "@/lib/utils";

type QuoteDetail = QuoteRenderData & {
  status: string;
  plan_chosen: string;
  client_id: string;
  subtotal: number;
  total_before_gst: number;
  sent_date: string | null;
  sent_via: string[] | null;
  first_opened: string | null;
  last_opened: string | null;
  open_count: number;
  tags: string[] | null;
  pipeline_comment: string | null;
  clients: { name: string; client_type: string | null; source: string | null } | null;
};

type ContactSummary = {
  primary_email: string | null;
  secondary_email: string | null;
  primary_mobile: string | null;
  secondary_mobile: string | null;
  whatsapp_number: string | null;
  whatsapp_consent: boolean;
  do_not_contact: boolean;
};

type EmailEventRow = {
  id: string;
  recipient_email: string | null;
  subject: string | null;
  provider: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

type DripCampaignOption = {
  id: string;
  name: string;
  trigger_type: string;
  status: string;
};

type DripEnrollmentRow = {
  id: string;
  status: "active" | "paused" | "stopped" | "completed";
  current_step: number;
  next_step_at: string | null;
  last_step_at: string | null;
  stop_reason: string | null;
  drip_campaigns: { id: string; name: string; trigger_type: string; channel: string } | null;
};

export default async function QuoteDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string; whatsapp?: string }>;
}) {
  const [{ id }, query, profile] = await Promise.all([params, searchParams, requireProfile()]);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("quotes")
    .select(
      "id,quote_id_formatted,client_id,status,plan_chosen,subtotal,currency_code,state_variation_add,addon_items,addon_total,other_fee_items,other_fee_total,discount_amount,total_before_gst,gst_rate_percent,gst_amount,total_amount,prepaid_total_amount,postpaid_total_amount,show_service_breakup,include_prepaid_plan,include_postpaid_plan,recommended_plan,company_name_snapshot,client_mobile_snapshot,required_documents_snapshot,service_fee_overrides,document_items,custom_service_items,validity_date,custom_note,sent_date,sent_via,first_opened,last_opened,open_count,tags,pipeline_comment,clients(name,client_type,source),quotes_services(service_id,fee_snapshot,services(name,short_description,full_description,pricing_mode,currency_code,prepaid_fee,postpaid_fee,retainership_fee,retainership_cycle,prepaid_description,postpaid_description,inclusions,first_installment,first_trigger,second_trigger,timeline_typical,extra_costs_clause))"
    )
    .eq("id", id)
    .single();

  const quote = data as unknown as QuoteDetail | null;

  if (!quote) {
    return (
      <Card>
        <CardContent>
          <p className="font-bold">Quote not found.</p>
        </CardContent>
      </Card>
    );
  }

  const [{ data: contactData }, { data: footerSettings }, { data: emailEventData }, { data: dripCampaignData }, { data: dripEnrollmentData }] =
    await Promise.all([
      supabase
        .from("contact_details")
        .select("primary_email,secondary_email,primary_mobile,secondary_mobile,whatsapp_number,whatsapp_consent,do_not_contact")
        .eq("client_id", quote.client_id)
        .maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle(),
      supabase
        .from("email_events")
        .select("id,recipient_email,subject,provider,status,sent_at,opened_at,clicked_at,failed_at,failure_reason")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("drip_campaigns")
        .select("id,name,trigger_type,status")
        .in("status", ["draft", "active", "paused"])
        .order("name"),
      supabase
        .from("drip_enrollments")
        .select("id,status,current_step,next_step_at,last_step_at,stop_reason,drip_campaigns(id,name,trigger_type,channel)")
        .eq("quote_id", quote.id)
        .order("enrolled_at", { ascending: false })
    ]);

  const contact = contactData as ContactSummary | null;
  const emailEvents = (emailEventData ?? []) as EmailEventRow[];
  const latestEmailEvent = emailEvents[0] ?? null;
  // Comments load AFTER the main quote fetch so this page never blocks on a
  // missing quote_comments table (loadQuoteComments returns [] on error).
  const comments = await loadQuoteComments(quote.id);
  const dripCampaigns = (dripCampaignData ?? []) as DripCampaignOption[];
  const dripEnrollments = (((dripEnrollmentData ?? []) as unknown[]) as Array<
    Omit<DripEnrollmentRow, "drip_campaigns"> & {
      drip_campaigns: DripEnrollmentRow["drip_campaigns"] | DripEnrollmentRow["drip_campaigns"][];
    }
  >).map((enrollment) => ({
    ...enrollment,
    drip_campaigns: Array.isArray(enrollment.drip_campaigns) ? enrollment.drip_campaigns[0] ?? null : enrollment.drip_campaigns
  }));
  const enrolledCampaignIds = new Set(dripEnrollments.map((enrollment) => enrollment.drip_campaigns?.id).filter(Boolean));
  const availableDripCampaigns = dripCampaigns.filter((campaign) => !enrolledCampaignIds.has(campaign.id));
  const emailForSending = contact?.primary_email || contact?.secondary_email || "";
  const whatsappNumber = contact?.whatsapp_number || contact?.primary_mobile || contact?.secondary_mobile || "";
  const whatsappMessage = buildWhatsAppBrief(quote);
  const serviceNames = getQuoteServiceNames(quote);
  const userCanSend = canSendQuote(profile.role);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">{quote.quote_id_formatted}</p>
          <h1 className="mt-1 text-3xl font-black text-black">{quote.clients?.name ?? "Quote"}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {serviceNames || "Quotation"} | Valid until {formatDate(quote.validity_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 no-print">
          <StatusPill tone={quoteStatusTone(quote.status)}>{quote.status.replaceAll("_", " ")}</StatusPill>
          <Link href="/quotes/new">
            <Button variant="ghost">Create another quote</Button>
          </Link>
        </div>
      </header>

      {query.error ? <Notice tone="red">{query.error}</Notice> : null}
      {query.success ? <Notice tone="green">{query.success}</Notice> : null}
      {query.whatsapp ? <Notice tone="green">WhatsApp brief and PDF sheet are ready in the WhatsApp / PDF panel.</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Summary label="Recommended plan" value={quote.recommended_plan.replaceAll("_", " ")} />
              <Summary
                label="Plans shown"
                value={[quote.include_prepaid_plan ? "Prepaid" : "", quote.include_postpaid_plan ? "Postpaid" : ""].filter(Boolean).join(" + ")}
              />
              <Summary label="Client type" value={quote.clients?.client_type ?? "Not set"} />
              <Summary label="Source" value={quote.clients?.source ?? "Not set"} />
              <Summary label="Sent via" value={quote.sent_via?.join(" + ") || "Not sent yet"} />
              {quote.sent_date ? <Summary label="Sent date" value={formatDateTime(quote.sent_date)} /> : null}
              <Summary label="Open count" value={String(quote.open_count ?? 0)} />
              {quote.first_opened ? <Summary label="First open" value={formatDateTime(quote.first_opened)} /> : null}
              {quote.last_opened ? <Summary label="Last open" value={formatDateTime(quote.last_opened)} /> : null}
              <div className="flex flex-wrap gap-2">
                {(quote.tags ?? []).map((tag) => (
                  <StatusPill key={tag}>{tag}</StatusPill>
                ))}
              </div>
              {quote.custom_note ? (
                <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm leading-6 text-neutral-700">
                  {quote.custom_note}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>Working notes</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentThread
                quoteId={quote.id}
                initialComments={comments}
                currentUser={{ id: profile.id, full_name: profile.full_name, email: profile.email }}
                legacyNote={quote.pipeline_comment}
              />
            </CardContent>
          </Card>

          <QuoteDocumentPreview quote={quote} footerSettings={footerSettings?.value} />
        </div>

        <div className="space-y-6">
          <Card className="no-print">
            <CardHeader>
              <CardTitle>Quote status</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateQuoteStatusFromDetail} className="grid gap-3">
                <input type="hidden" name="quote_id" value={quote.id} />
                <select
                  name="status"
                  defaultValue={quote.status === "draft" ? "sent" : quote.status}
                  className="focus-ring min-h-10 rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-semibold"
                >
                  <option value="sent">sent</option>
                  <option value="viewed">viewed</option>
                  <option value="negotiating">negotiating</option>
                  <option value="accepted">accepted</option>
                  <option value="expired">expired</option>
                  <option value="refresh_requested">refresh requested</option>
                  <option value="lost">lost</option>
                  <option value="lost_nurture">lost nurture</option>
                  <option value="dormant">dormant</option>
                  <option value="spam">spam</option>
                  <option value="superseded">superseded</option>
                </select>
                <Button type="submit" variant="ghost">
                  Save status
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>Contact snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Summary label="Primary email" value={contact?.primary_email ? maskEmail(contact.primary_email) : "Not set"} />
              {contact?.secondary_email ? <Summary label="Secondary email" value={maskEmail(contact.secondary_email)} /> : null}
              <Summary label="Primary mobile" value={contact?.primary_mobile ? maskMobile(contact.primary_mobile) : "Not set"} />
              {contact?.secondary_mobile ? <Summary label="Secondary mobile" value={maskMobile(contact.secondary_mobile)} /> : null}
              <Summary label="WhatsApp" value={whatsappNumber ? maskMobile(whatsappNumber) : "Not set"} />
              <Summary label="WhatsApp consent" value={contact?.whatsapp_consent ? "Yes" : "No"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Amounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {quote.include_prepaid_plan ? <Summary label="Prepaid total" value={formatCurrency(quote.prepaid_total_amount, quote.currency_code)} /> : null}
              {quote.include_postpaid_plan ? <Summary label="Postpaid total" value={formatCurrency(quote.postpaid_total_amount, quote.currency_code)} /> : null}
              <Summary label="State variation" value={formatCurrency(quote.state_variation_add, quote.currency_code)} />
              <Summary label="Add-ons" value={formatCurrency(quote.addon_total, quote.currency_code)} />
              <Summary label="Other fees / adjustments" value={formatCurrency(quote.other_fee_total, quote.currency_code)} />
              <Summary label="Discount" value={formatCurrency(quote.discount_amount, quote.currency_code)} />
              <Summary label="GST" value={`${quote.gst_rate_percent}% - ${formatCurrency(quote.gst_amount, quote.currency_code)}`} />
              <Summary label="Total" value={formatCurrency(quote.total_amount, quote.currency_code)} />
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>Send quote</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                <div className="flex items-center gap-2 text-sm font-black text-black">
                  <Mail className="h-4 w-4" />
                  Email
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  {emailForSending ? maskEmail(emailForSending) : "No email saved for this client."}
                </p>
                {contact?.secondary_email ? <p className="mt-1 text-xs text-neutral-500">Backup: {maskEmail(contact.secondary_email)}</p> : null}
              </div>
              <form action={sendQuoteByEmail}>
                <input type="hidden" name="quote_id" value={quote.id} />
                <Button type="submit" className="w-full" disabled={!userCanSend || !emailForSending || contact?.do_not_contact}>
                  Send email
                </Button>
              </form>
              {contact?.do_not_contact ? <p className="text-xs font-semibold text-[#b42318]">This client is marked Do Not Contact.</p> : null}
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>WhatsApp / PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                <div className="flex items-center gap-2 text-sm font-black text-black">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  {whatsappNumber ? maskMobile(whatsappNumber) : "No WhatsApp number saved."}
                  {contact?.whatsapp_consent ? " | consent recorded" : ""}
                </p>
                {contact?.secondary_mobile ? <p className="mt-1 text-xs text-neutral-500">Backup: {maskMobile(contact.secondary_mobile)}</p> : null}
              </div>
              <QuoteShareTools whatsappMessage={whatsappMessage} printHref={`/quotes/${quote.id}/print`} />
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle>Drip automation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={enrollQuoteInDripFromDetail} className="grid gap-3">
                <input type="hidden" name="quote_id" value={quote.id} />
                <select
                  name="campaign_id"
                  defaultValue=""
                  className="focus-ring min-h-10 rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-semibold"
                >
                  <option value="">Enroll in drip campaign</option>
                  {availableDripCampaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} | {campaign.trigger_type.replaceAll("_", " ")} | {campaign.status}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="ghost" disabled={!availableDripCampaigns.length}>
                  Add to drip
                </Button>
              </form>

              {dripEnrollments.length ? (
                <div className="space-y-3">
                  {dripEnrollments.map((enrollment) => (
                    <div key={enrollment.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-black">{enrollment.drip_campaigns?.name ?? "Drip"}</p>
                        <StatusPill>{enrollment.drip_campaigns?.channel ?? "both"}</StatusPill>
                        <StatusPill tone={enrollment.status === "active" ? "green" : enrollment.status === "paused" ? "amber" : "black"}>
                          {enrollment.status}
                        </StatusPill>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-neutral-500">
                        <p>Current step: {enrollment.current_step || 0}</p>
                        <p>Next step: {formatDateTime(enrollment.next_step_at)}</p>
                        <p>Last step: {formatDateTime(enrollment.last_step_at)}</p>
                        {enrollment.stop_reason ? <p>Reason: {enrollment.stop_reason}</p> : null}
                      </div>
                      <form action={updateQuoteDripEnrollmentStatus} className="mt-3 grid gap-2">
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <input type="hidden" name="enrollment_id" value={enrollment.id} />
                        <select
                          name="status"
                          defaultValue={enrollment.status === "completed" ? "stopped" : enrollment.status}
                          className="focus-ring min-h-10 rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-semibold"
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="stopped">stopped</option>
                        </select>
                        <Button type="submit" variant="ghost">
                          Update drip
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No drip campaigns enrolled for this quote yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest email activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestEmailEvent?.status === "failed" ? (
                <div className="rounded-md border border-[#f4c7c3] bg-[#fff0ed] p-3 text-sm">
                  <p className="font-black text-[#b42318]">Latest send failed</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Recipient: {latestEmailEvent.recipient_email || "No recipient saved"}
                  </p>
                  <p className="mt-2 text-xs text-[#b42318]">
                    {latestEmailEvent.failure_reason || "Could not deliver this email. Please verify the saved email address."}
                  </p>
                </div>
              ) : null}
              {emailEvents.length ? (
                emailEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-black text-black">{event.status}</p>
                      <p className="text-xs text-neutral-500">{event.provider || "email"}</p>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{event.recipient_email || "No recipient email"}</p>
                    <p className="mt-2 text-xs text-neutral-600">{event.subject || "No subject saved"}</p>
                    <div className="mt-3 grid gap-1 text-xs text-neutral-500">
                      <p>Sent: {formatDateTime(event.sent_at)}</p>
                      <p>Opened: {formatDateTime(event.opened_at)}</p>
                      <p>Clicked: {formatDateTime(event.clicked_at)}</p>
                      {event.failed_at ? <p>Failed: {formatDateTime(event.failed_at)}</p> : null}
                      {event.failure_reason ? <p className="text-[#b42318]">{event.failure_reason}</p> : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-500">No email events recorded for this quote yet.</p>
              )}
              {process.env.APP_BASE_URL?.includes("localhost") ? (
                <p className="rounded-md border border-[#f4c7c3] bg-[#fff0ed] p-3 text-xs font-semibold text-[#b42318]">
                  Open tracking will not work for external recipients while `APP_BASE_URL` points to localhost. Use your public app domain for real tracking.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-bold capitalize">{value}</span>
    </div>
  );
}


