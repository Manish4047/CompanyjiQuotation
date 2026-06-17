import { MessageSquare, PhoneCall } from "lucide-react";
import { addLeadComment, createLead, updateLead, updateLeadReminderState } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activeLeadStatuses,
  canAccessLeadRecord,
  canManageLeadAssignments,
  canViewAllLeads,
  formatLeadDateTime,
  isClosedLeadStatus,
  leadFeatureWarningFromError,
  leadFunnelStatuses,
  leadSources,
  leadStatusLabel,
  leadStatuses,
  leadStatusTone,
  manualLeadStatuses,
  reminderState
} from "@/lib/leads";
import { quoteStatusTone } from "@/lib/utils";

type LeadRow = {
  id: string;
  lead_code: string;
  company_name: string;
  contact_name: string | null;
  director_name: string | null;
  phone: string;
  whatsapp_number: string | null;
  source: string;
  status: string;
  quality: number;
  assigned_to: string | null;
  created_by: string | null;
  next_follow_up_at: string | null;
  next_follow_up_note: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile?: unknown;
  linked_quotes?: Array<LeadQuoteLink>;
};

type LeadQuoteLink = {
  id: string;
  quote_id_formatted: string;
  status: string;
  created_at: string;
};

type LeadDetail = LeadRow & {
  cin: string | null;
  email: string | null;
  alternate_phone: string | null;
  compliance_notes: string | null;
  remarks: string | null;
  tags: string[] | null;
  comments?: Array<{
    id: string;
    body: string;
    created_at: string;
    is_system: boolean;
    author?: unknown;
  }>;
  reminders?: Array<{
    id: string;
    due_at: string;
    note: string | null;
    status: string;
    assignee?: unknown;
  }>;
  conversations?: Array<{
    id: string;
    contact_name: string | null;
    last_message_at: string | null;
    unread_count: number;
  }>;
  ingest_events?: Array<{
    id: string;
    source: string;
    source_label: string | null;
    form_name: string | null;
    processing_status: string;
    source_created_at: string | null;
    created_at: string;
    notes: string | null;
  }>;
  linked_quotes?: LeadQuoteLink[];
};

type ActiveProfileOption = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
};

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    owner?: string;
    q?: string;
    selected?: string;
    source?: string;
    status?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = createAdminClient();
  const canAssign = canManageLeadAssignments(profile.role);

  const [leadResult, assigneeResult] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id,lead_code,company_name,contact_name,director_name,phone,whatsapp_number,source,status,quality,assigned_to,created_by,next_follow_up_at,next_follow_up_note,created_at,updated_at,assigned_profile:profiles!leads_assigned_to_fkey(full_name),linked_quotes:quotes!quotes_source_lead_id_fkey(id,quote_id_formatted,status,created_at)"
      )
      .order("updated_at", { ascending: false })
      .limit(300),
    canAssign
      ? supabase.from("profiles").select("id,full_name,role,active").eq("active", true).order("full_name")
      : Promise.resolve({
          data: [{ id: profile.id, full_name: profile.full_name, role: profile.role, active: true }],
          error: null
        })
  ]);

  const warning = leadFeatureWarningFromError(leadResult.error ?? assigneeResult.error);
  if (warning) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Lead command center</p>
          <h1 className="mt-1 text-3xl font-black text-black">Leads</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            This module needs the latest Supabase migration before the CRM can store leads and WhatsApp conversations.
          </p>
        </header>
        <Notice tone="red">{warning}</Notice>
      </div>
    );
  }

  const allLeads = ((leadResult.data ?? []) as LeadRow[]).filter((lead) => canAccessLeadRecord(profile, lead));
  const assignees = ((assigneeResult.data ?? []) as ActiveProfileOption[]).filter((person) => person.active);
  const filteredLeads = filterLeads(allLeads, params, profile.id, canViewAllLeads(profile.role));
  const selectedId = params.selected || filteredLeads[0]?.id || allLeads[0]?.id || null;

  const selectedLeadResult = selectedId
    ? await supabase
        .from("leads")
        .select(
          [
            "id,lead_code,company_name,contact_name,director_name,cin,email,phone,alternate_phone,whatsapp_number,source,status,quality,assigned_to,created_by,next_follow_up_at,next_follow_up_note,compliance_notes,remarks,tags,created_at,updated_at",
            "assigned_profile:profiles!leads_assigned_to_fkey(full_name)",
            "comments:lead_comments(id,body,created_at,is_system,author:profiles!lead_comments_author_id_fkey(full_name))",
            "reminders:lead_reminders(id,due_at,note,status,assignee:profiles!lead_reminders_assigned_to_fkey(full_name))",
            "conversations:whatsapp_conversations(id,contact_name,last_message_at,unread_count)",
            "ingest_events:lead_ingest_events(id,source,source_label,form_name,processing_status,source_created_at,created_at,notes)",
            "linked_quotes:quotes!quotes_source_lead_id_fkey(id,quote_id_formatted,status,created_at)"
          ].join(",")
        )
        .eq("id", selectedId)
        .maybeSingle()
    : { data: null, error: null };
  const detailWarning = leadFeatureWarningFromError(selectedLeadResult.error);
  if (detailWarning) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Lead command center</p>
          <h1 className="mt-1 text-3xl font-black text-black">Leads</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            This module needs the latest Supabase migration before the CRM can store leads and source intake history.
          </p>
        </header>
        <Notice tone="red">{detailWarning}</Notice>
      </div>
    );
  }

  const selectedLeadData =
    selectedLeadResult.data && typeof selectedLeadResult.data === "object"
      ? (selectedLeadResult.data as unknown as LeadDetail)
      : null;
  const selectedLead = selectedLeadData && canAccessLeadRecord(profile, selectedLeadData) ? selectedLeadData : null;
  const overview = buildLeadOverview(allLeads, filteredLeads);
  const funnelColumns = leadFunnelStatuses.map((status) => ({
    status,
    label: leadFunnelColumnLabel(status),
    leads: filteredLeads.filter((lead) => lead.status === status && !isLeadInQuoteFollowThrough(lead)).sort(sortLeadCards)
  }));
  const quoteFollowThroughLeads = filteredLeads.filter((lead) => isLeadInQuoteFollowThrough(lead) && !isClosedLeadStatus(lead.status)).sort(sortLeadCards);
  const selectedLeadLatestQuote = selectedLead ? latestLinkedQuote(selectedLead) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Lead command center</p>
          <h1 className="mt-1 text-3xl font-black text-black">Leads</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Keep pre-quote work inside the lead funnel, then move commercial follow-through into the quotation pipeline.
            Agents should always know which leads need contact, which are ready for a quote, and which now belong in quote-stage follow-up.
          </p>
        </div>
        <div className="hidden items-center gap-3 text-sm text-neutral-600">
          <span>{filteredLeads.length} visible leads</span>
          <span>·</span>
          <span>{allLeads.filter((lead) => lead.next_follow_up_at).length} with reminders</span>
                          <span>|</span>
          <span>{allLeads.filter((lead) => !lead.assigned_to).length} unassigned</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
          <span>{filteredLeads.length} visible leads</span>
          <span>|</span>
          <span>{overview.overdue} overdue</span>
          <span>|</span>
          <span>{overview.readyForQuote} ready for quote</span>
          <span>|</span>
          <span>{overview.inQuoteFollowThrough} in quote follow-through</span>
        </div>
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Lead operating model</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-neutral-700 md:grid-cols-4">
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            New leads from Meta, Google Forms, WhatsApp, website forms, and manual entry all land here.
          </div>
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            Agents work the intake funnel from `new` to `contacting` to `qualified`, and every active lead should carry a dated next step.
          </div>
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            Use `Create quote` only when a lead is genuinely ready. After that, the commercial chase belongs in the quotation pipeline.
          </div>
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            Managers keep assignment discipline tight and use the quote follow-through queue to make sure qualified leads do not stall after handoff.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s lead view</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <OverviewMetric label="Needs assignment" value={overview.unassigned} helper="Leads without an owner" tone="amber" />
            <OverviewMetric label="Overdue follow-up" value={overview.overdue} helper="Past-due callbacks to act on now" tone="red" />
            <OverviewMetric label="Ready for quote" value={overview.readyForQuote} helper="Qualified leads with no quote yet" tone="green" />
            <OverviewMetric label="In quote follow-through" value={overview.inQuoteFollowThrough} helper="Commercial stage now belongs in /pipeline" tone="black" />
            <OverviewMetric label="Converted" value={overview.converted} helper="Leads already won" tone="green" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3 xl:grid-cols-4">
              {funnelColumns.map((column) => (
                <LeadBoardColumn key={column.status} title={column.label} count={column.leads.length}>
                  {column.leads.length ? (
                    column.leads.slice(0, 4).map((lead) => <MiniLeadCard key={lead.id} lead={lead} />)
                  ) : (
                    <div className="rounded-md border border-dashed border-[#d9ded1] bg-white p-3 text-xs text-neutral-400">
                      No leads in this stage.
                    </div>
                  )}
                </LeadBoardColumn>
              ))}
            </div>

            <LeadBoardColumn title="Quotation follow-through" count={quoteFollowThroughLeads.length} accent="black">
              <p className="text-xs leading-5 text-neutral-600">
                These leads already have a quote or came in as quote-stage records. Run the commercial chase from the quotation pipeline.
              </p>
              {quoteFollowThroughLeads.length ? (
                quoteFollowThroughLeads.slice(0, 5).map((lead) => <MiniLeadCard key={lead.id} lead={lead} emphasizeQuote />)
              ) : (
                <div className="rounded-md border border-dashed border-[#d9ded1] bg-white p-3 text-xs text-neutral-400">
                  No handoff leads right now.
                </div>
              )}
              <a
                href="/pipeline"
                className="inline-flex items-center justify-center rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-bold text-black hover:bg-[#eef2e6]"
              >
                Open quotation pipeline
              </a>
            </LeadBoardColumn>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a lead</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createLead} className="grid gap-4 xl:grid-cols-2">
            <Field label="Company name">
              <Input name="company_name" placeholder="Company Ji inbound lead" required />
            </Field>
            <Field label="Contact name">
              <Input name="contact_name" placeholder="Director or primary contact" />
            </Field>
            <Field label="Director name">
              <Input name="director_name" placeholder="Optional" />
            </Field>
            <Field label="Phone">
              <Input name="phone" placeholder="9876543210" required />
            </Field>
            <Field label="WhatsApp number">
              <Input name="whatsapp_number" placeholder="Defaults to phone if blank" />
            </Field>
            <Field label="Email">
              <Input name="email" placeholder="name@company.com" />
            </Field>
            <Field label="Source">
              <Select name="source" defaultValue="Manual">
                {leadSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="new">
                {manualLeadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {leadStatusLabel(status)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quality">
              <Select name="quality" defaultValue="3">
                {[5, 4, 3, 2, 1].map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}/5
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assign to">
              <Select name="assigned_to" defaultValue={canAssign ? "" : profile.id} disabled={!canAssign}>
                {canAssign ? <option value="">Unassigned</option> : null}
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Next follow-up">
              <Input name="next_follow_up_at" type="datetime-local" />
            </Field>
            <Field label="Reminder note">
              <Input name="next_follow_up_note" placeholder="Next contact step for the agent" />
            </Field>
            <div className="xl:col-span-2 grid gap-4 xl:grid-cols-2">
              <Field label="Compliance notes">
                <Textarea name="compliance_notes" placeholder="ROC pending, DIN inactive, strike-off required" />
              </Field>
              <Field label="Remarks">
                <Textarea name="remarks" placeholder="Conversation summary, objections, next steps" />
              </Field>
            </div>
            <Field label="Tags">
              <Input name="tags" placeholder="hot, june, strike-off" />
            </Field>
            <div className="flex items-end">
              <Button>Create lead</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <form className="grid gap-4">
                <Field label="Search">
                  <Input name="q" defaultValue={params.q ?? ""} placeholder="Company, contact, phone, code" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    <Select name="status" defaultValue={params.status ?? "all"}>
                      <option value="all">All statuses</option>
                      <option value="ready_for_quote">Ready for quote</option>
                      <option value="quote_follow_through">In quote follow-through</option>
                      {leadStatuses.map((status) => (
                        <option key={status} value={status}>
                          {leadStatusLabel(status)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Source">
                    <Select name="source" defaultValue={params.source ?? "all"}>
                      <option value="all">All sources</option>
                      {leadSources.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {canAssign ? (
                  <Field label="Owner">
                    <Select name="owner" defaultValue={params.owner ?? "all"}>
                      <option value="all">Everyone</option>
                      <option value="mine">Only my leads</option>
                      <option value="unassigned">Unassigned</option>
                      {assignees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <input type="hidden" name="owner" value="mine" />
                )}
                {selectedLead ? <input type="hidden" name="selected" value={selectedLead.id} /> : null}
                <Button type="submit" variant="ghost">
                  Apply filters
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead list</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredLeads.length ? (
                filteredLeads.map((lead) => {
                  const assigneeName = pickLinkedName(lead.assigned_profile) || "Unassigned";
                  const reminder = reminderState(lead.next_follow_up_at);
                  const href = buildLeadHref(params, lead.id);
                  const latestQuote = latestLinkedQuote(lead);
                  const inQuoteFollowThrough = isLeadInQuoteFollowThrough(lead);
                  const readyForQuote = isReadyForQuote(lead);
                  return (
                    <a
                      key={lead.id}
                      href={href}
                      className={`block rounded-md border p-4 transition ${
                        selectedLead?.id === lead.id
                          ? "border-[#a0ce4e] bg-[#fbfcf8]"
                          : "border-[#e6ebdc] bg-white hover:border-[#a0ce4e]"
                      }`}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-black">{lead.company_name}</p>
                            <p className="text-sm text-neutral-600">
                              {lead.contact_name || lead.director_name || "Primary contact pending"}
                            </p>
                          </div>
                          <StatusPill tone={leadStatusTone(lead.status)}>{leadStatusLabel(lead.status)}</StatusPill>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {readyForQuote ? <StatusPill tone="green">Ready for quote</StatusPill> : null}
                          {inQuoteFollowThrough && latestQuote ? (
                            <StatusPill tone={quoteStatusTone(latestQuote.status)}>
                              {latestQuote.quote_id_formatted} | {formatQuoteStage(latestQuote.status)}
                            </StatusPill>
                          ) : null}
                          {!lead.assigned_to ? <StatusPill tone="amber">Needs owner</StatusPill> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                          <span>{lead.lead_code}</span>
                          <span>|</span>
                          <span>{lead.source}</span>
                          <span>|</span>
                          <span>{assigneeName}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-neutral-700">{lead.phone}</p>
                          <StatusPill tone={reminder.tone}>{reminder.label}</StatusPill>
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                  No leads match this view yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {selectedLead ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#6a912f]">Lead detail</p>
                    <h2 className="mt-1 text-2xl font-black text-black">{selectedLead.company_name}</h2>
                    <p className="mt-1 text-sm text-neutral-600">
                      {selectedLead.lead_code} | {pickLinkedName(selectedLead.assigned_profile) || "Unassigned"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill tone={leadStatusTone(selectedLead.status)}>{leadStatusLabel(selectedLead.status)}</StatusPill>
                      {isReadyForQuote(selectedLead) ? <StatusPill tone="green">Ready for quote</StatusPill> : null}
                      {selectedLeadLatestQuote ? (
                        <StatusPill tone={quoteStatusTone(selectedLeadLatestQuote.status)}>
                          {selectedLeadLatestQuote.quote_id_formatted} | {formatQuoteStage(selectedLeadLatestQuote.status)}
                        </StatusPill>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/quotes/new?lead=${selectedLead.id}`}>
                      <Button>{selectedLeadLatestQuote ? "Create another quote" : "Create quote"}</Button>
                    </a>
                    {selectedLeadLatestQuote ? (
                      <a href={`/quotes/${selectedLeadLatestQuote.id}`}>
                        <Button variant="ghost">Open latest quote</Button>
                      </a>
                    ) : null}
                    {selectedLeadLatestQuote ? (
                      <a href="/pipeline">
                        <Button variant="ghost">Open pipeline</Button>
                      </a>
                    ) : null}
                    {selectedLead.conversations?.[0] ? (
                      <a href={`/whatsapp-inbox?selected=${selectedLead.conversations[0].id}`}>
                        <Button variant="ghost">
                          <MessageSquare className="h-4 w-4" />
                          Open inbox
                        </Button>
                      </a>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <form action={updateLead} className="grid gap-4 xl:grid-cols-2">
                    <input type="hidden" name="lead_id" value={selectedLead.id} />
                    <Field label="Company name">
                      <Input name="company_name" defaultValue={selectedLead.company_name} required />
                    </Field>
                    <Field label="Contact name">
                      <Input name="contact_name" defaultValue={selectedLead.contact_name ?? ""} />
                    </Field>
                    <Field label="Director name">
                      <Input name="director_name" defaultValue={selectedLead.director_name ?? ""} />
                    </Field>
                    <Field label="CIN">
                      <Input name="cin" defaultValue={selectedLead.cin ?? ""} />
                    </Field>
                    <Field label="Phone">
                      <Input name="phone" defaultValue={selectedLead.phone} required />
                    </Field>
                    <Field label="Alternate phone">
                      <Input name="alternate_phone" defaultValue={selectedLead.alternate_phone ?? ""} />
                    </Field>
                    <Field label="WhatsApp number">
                      <Input name="whatsapp_number" defaultValue={selectedLead.whatsapp_number ?? ""} />
                    </Field>
                    <Field label="Email">
                      <Input name="email" defaultValue={selectedLead.email ?? ""} />
                    </Field>
                    <Field label="Source">
                      <Select name="source" defaultValue={selectedLead.source}>
                        {leadSources.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Status" hint="Lead stages stop at qualification. Quote-stage chasing should happen in the quotation pipeline.">
                      <Select name="status" defaultValue={selectedLead.status}>
                        {leadStatusOptionsFor(selectedLead.status).map((status) => (
                          <option key={status} value={status}>
                            {leadStatusLabel(status)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Quality">
                      <Select name="quality" defaultValue={String(selectedLead.quality)}>
                        {[5, 4, 3, 2, 1].map((quality) => (
                          <option key={quality} value={quality}>
                            {quality}/5
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Assign to">
                      <Select name="assigned_to" defaultValue={selectedLead.assigned_to ?? ""} disabled={!canAssign}>
                        {canAssign ? <option value="">Unassigned</option> : null}
                        {assignees.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.full_name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Next follow-up">
                      <Input name="next_follow_up_at" type="datetime-local" defaultValue={toDatetimeLocalValue(selectedLead.next_follow_up_at)} />
                    </Field>
                    <Field label="Reminder note">
                      <Input name="next_follow_up_note" defaultValue={selectedLead.next_follow_up_note ?? ""} />
                    </Field>
                    <Field label="Tags" hint="Comma-separated tags for quick filtering later.">
                      <Input name="tags" defaultValue={(selectedLead.tags ?? []).join(", ")} />
                    </Field>
                    <div className="xl:col-span-2 grid gap-4 xl:grid-cols-2">
                      <Field label="Compliance notes">
                        <Textarea name="compliance_notes" defaultValue={selectedLead.compliance_notes ?? ""} />
                      </Field>
                      <Field label="Remarks">
                        <Textarea name="remarks" defaultValue={selectedLead.remarks ?? ""} />
                      </Field>
                    </div>
                    <div className="xl:col-span-2 flex items-center justify-between gap-3">
                      <div className="text-sm text-neutral-500">
                        Follow-up: {formatLeadDateTime(selectedLead.next_follow_up_at)}
                      </div>
                      <Button>Save lead</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <div className="grid gap-6 2xl:grid-cols-[1fr_360px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Notes & activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form action={addLeadComment} className="space-y-3">
                      <input type="hidden" name="lead_id" value={selectedLead.id} />
                      <Field label="Add note">
                        <Textarea name="body" placeholder="Call summary, pricing objection, manager follow-up, commitment" />
                      </Field>
                      <Button variant="ghost">Save note</Button>
                    </form>

                    <div className="space-y-3">
                      {(selectedLead.comments ?? []).length ? (
                        (selectedLead.comments ?? [])
                          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
                          .map((comment) => (
                            <div key={comment.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                <span>{pickLinkedName(comment.author) || "System"}</span>
                                <span>·</span>
                                <span>{formatLeadDateTime(comment.created_at)}</span>
                                {comment.is_system ? <StatusPill tone="muted">System</StatusPill> : null}
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{comment.body}</p>
                            </div>
                          ))
                      ) : (
                        <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                          No notes yet. Use notes to capture the reason for the next action.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Reminder queue</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(selectedLead.reminders ?? []).length ? (
                        (selectedLead.reminders ?? [])
                          .sort((left, right) => new Date(left.due_at).getTime() - new Date(right.due_at).getTime())
                          .map((reminder) => (
                            <div key={reminder.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-black">{formatLeadDateTime(reminder.due_at)}</p>
                                  <p className="mt-1 text-sm text-neutral-600">{reminder.note || "Callback reminder"}</p>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    Owner: {pickLinkedName(reminder.assignee) || "Unassigned"}
                                  </p>
                                </div>
                                <StatusPill tone={reminder.status === "done" ? "green" : reminder.status === "dismissed" ? "red" : "amber"}>
                                  {reminder.status}
                                </StatusPill>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {reminder.status !== "done" ? (
                                  <form action={updateLeadReminderState}>
                                    <input type="hidden" name="lead_id" value={selectedLead.id} />
                                    <input type="hidden" name="reminder_id" value={reminder.id} />
                                    <input type="hidden" name="status" value="done" />
                                    <Button variant="ghost">Mark done</Button>
                                  </form>
                                ) : null}
                                {reminder.status !== "dismissed" ? (
                                  <form action={updateLeadReminderState}>
                                    <input type="hidden" name="lead_id" value={selectedLead.id} />
                                    <input type="hidden" name="reminder_id" value={reminder.id} />
                                    <input type="hidden" name="status" value="dismissed" />
                                    <Button variant="ghost">Dismiss</Button>
                                  </form>
                                ) : null}
                                {reminder.status !== "pending" ? (
                                  <form action={updateLeadReminderState}>
                                    <input type="hidden" name="lead_id" value={selectedLead.id} />
                                    <input type="hidden" name="reminder_id" value={reminder.id} />
                                    <input type="hidden" name="status" value="pending" />
                                    <Button variant="ghost">Reopen</Button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                          No reminders yet. Schedule the next callback from the lead form.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Quick facts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-neutral-700">
                      <FactRow label="Quote link">
                        {selectedLeadLatestQuote ? (
                          <a href={`/quotes/${selectedLeadLatestQuote.id}`} className="font-bold text-[#6a912f]">
                            {selectedLeadLatestQuote.quote_id_formatted}
                          </a>
                        ) : (
                          <a href={`/quotes/new?lead=${selectedLead.id}`} className="font-bold text-[#6a912f]">
                            Start first quote
                          </a>
                        )}
                      </FactRow>
                      <FactRow label="Operating lane">
                        {selectedLeadLatestQuote ? "Quotation pipeline" : "Lead funnel"}
                      </FactRow>
                      <FactRow label="Quote stage">
                        {selectedLeadLatestQuote ? formatQuoteStage(selectedLeadLatestQuote.status) : "No quote yet"}
                      </FactRow>
                      <FactRow label="WhatsApp">
                        {selectedLead.whatsapp_number || "Not saved"}
                      </FactRow>
                      <FactRow label="Latest reminder">
                        {formatLeadDateTime(selectedLead.next_follow_up_at)}
                      </FactRow>
                      <FactRow label="Phone">
                        {selectedLead.phone}
                      </FactRow>
                      <FactRow label="Source">
                        {selectedLead.source}
                      </FactRow>
                      <FactRow label="Inbox link">
                        {selectedLead.conversations?.[0] ? (
                          <a href={`/whatsapp-inbox?selected=${selectedLead.conversations[0].id}`} className="font-bold text-[#6a912f]">
                            Open conversation
                          </a>
                        ) : (
                          "Conversation not linked yet"
                        )}
                      </FactRow>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Lead source history</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(selectedLead.ingest_events ?? []).length ? (
                        (selectedLead.ingest_events ?? [])
                          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
                          .slice(0, 5)
                          .map((event) => (
                            <div key={event.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 text-sm text-neutral-700">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                <span>{event.source_label || event.source}</span>
                          <span>|</span>
                                <span>{event.form_name || "Direct intake"}</span>
                                <StatusPill tone={event.processing_status === "processed" ? "green" : event.processing_status === "duplicate" ? "amber" : "red"}>
                                  {event.processing_status}
                                </StatusPill>
                              </div>
                              <p className="mt-2">{event.notes || "Lead captured into the CRM intake pipeline."}</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {formatLeadDateTime(event.source_created_at || event.created_at)}
                              </p>
                            </div>
                          ))
                      ) : (
                        <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                          Manual leads or older records without synced source history will show up here once the intake routes are used.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#edf7df] text-[#47651d]">
                  <PhoneCall className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-lg font-black text-black">Pick a lead to start working</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    The right panel becomes the agent workspace for notes, reminders, and next action control.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: number;
  helper: string;
  tone: "red" | "amber" | "green" | "black";
}) {
  return (
    <div className="rounded-2xl border border-[#d9ded1] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500">{label}</p>
          <p className="mt-2 text-3xl font-black leading-none text-black">{value}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
            tone === "red"
              ? "bg-[#fff0ed] text-[#b42318]"
              : tone === "amber"
                ? "bg-[#fff7df] text-[#7a5200]"
                : tone === "green"
                  ? "bg-[#edf7df] text-[#47651d]"
                  : "bg-black text-white"
          }`}
        >
          {tone}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-600">{helper}</p>
    </div>
  );
}

function LeadBoardColumn({
  title,
  count,
  children,
  accent = "green"
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  accent?: "green" | "black";
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border p-3 ${
        accent === "black" ? "border-[#d6d6d6] bg-[#f7f7f5]" : "border-[#dfe8cf] bg-[#f8fbf2]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-black">{title}</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-neutral-600">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MiniLeadCard({
  lead,
  emphasizeQuote
}: {
  lead: LeadRow;
  emphasizeQuote?: boolean;
}) {
  const latestQuote = latestLinkedQuote(lead);
  const reminder = reminderState(lead.next_follow_up_at);

  return (
    <a href={buildLeadHref({}, lead.id)} className="block rounded-md border border-[#e6ebdc] bg-white p-3 hover:border-[#a0ce4e]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">{lead.company_name}</p>
          <p className="truncate text-[11px] text-neutral-500">{lead.contact_name || lead.director_name || lead.phone}</p>
        </div>
        <StatusPill tone={leadStatusTone(lead.status)}>{leadStatusLabel(lead.status)}</StatusPill>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span>{lead.lead_code}</span>
        <span>|</span>
        <span>{lead.source}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {latestQuote ? (
          <StatusPill tone={quoteStatusTone(latestQuote.status)}>
            {latestQuote.quote_id_formatted} | {formatQuoteStage(latestQuote.status)}
          </StatusPill>
        ) : null}
        {!latestQuote || !emphasizeQuote ? <StatusPill tone={reminder.tone}>{reminder.label}</StatusPill> : null}
      </div>
    </a>
  );
}

function filterLeads(
  leads: LeadRow[],
  params: { owner?: string; q?: string; source?: string; status?: string },
  profileId: string,
  canViewEveryone: boolean
) {
  const query = String(params.q ?? "").trim().toLowerCase();
  const status = String(params.status ?? "all");
  const source = String(params.source ?? "all");
  const owner = String(params.owner ?? (canViewEveryone ? "all" : "mine"));

  return leads.filter((lead) => {
    if (status === "ready_for_quote" && !isReadyForQuote(lead)) return false;
    if (status === "quote_follow_through" && !isLeadInQuoteFollowThrough(lead)) return false;
    if (!["all", "ready_for_quote", "quote_follow_through"].includes(status) && lead.status !== status) return false;
    if (source !== "all" && lead.source !== source) return false;
    if (owner === "mine" && lead.assigned_to !== profileId && lead.created_by !== profileId) return false;
    if (owner === "unassigned" && lead.assigned_to) return false;
    if (owner !== "all" && owner !== "mine" && owner !== "unassigned" && lead.assigned_to !== owner) return false;
    if (!query) return true;

    return [
      lead.company_name,
      lead.contact_name ?? "",
      lead.director_name ?? "",
      lead.phone,
      lead.lead_code,
      lead.source,
      ...(lead.linked_quotes ?? []).map((quote) => quote.quote_id_formatted)
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function buildLeadOverview(allLeads: LeadRow[], filteredLeads: LeadRow[]) {
  const activeStatusSet = new Set<string>(activeLeadStatuses);

  return {
    unassigned: filteredLeads.filter((lead) => !lead.assigned_to && activeStatusSet.has(lead.status)).length,
    overdue: filteredLeads.filter(isOverdueLead).length,
    readyForQuote: filteredLeads.filter(isReadyForQuote).length,
    inQuoteFollowThrough: filteredLeads.filter(isLeadInQuoteFollowThrough).length,
    converted: allLeads.filter((lead) => lead.status === "converted").length
  };
}

function isOverdueLead(lead: { status: string; next_follow_up_at: string | null }) {
  if (isClosedLeadStatus(lead.status) || !lead.next_follow_up_at) return false;
  const dueAt = new Date(lead.next_follow_up_at).getTime();
  return !Number.isNaN(dueAt) && dueAt <= Date.now();
}

function isLeadInQuoteFollowThrough(lead: { status: string; linked_quotes?: LeadQuoteLink[] | null }) {
  return lead.status === "quotation_sent" || Boolean(lead.linked_quotes?.length);
}

function isReadyForQuote(lead: { status: string; linked_quotes?: LeadQuoteLink[] | null }) {
  return lead.status === "qualified" && !isLeadInQuoteFollowThrough(lead);
}

function latestLinkedQuote(lead: { linked_quotes?: LeadQuoteLink[] | null }) {
  const items = lead.linked_quotes ?? [];
  if (!items.length) return null;

  return [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;
}

function sortLeadCards(left: LeadRow, right: LeadRow) {
  const leftOverdue = Number(isOverdueLead(left));
  const rightOverdue = Number(isOverdueLead(right));
  if (leftOverdue !== rightOverdue) return rightOverdue - leftOverdue;

  const leftQuote = Number(isLeadInQuoteFollowThrough(left));
  const rightQuote = Number(isLeadInQuoteFollowThrough(right));
  if (leftQuote !== rightQuote) return rightQuote - leftQuote;

  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

function leadFunnelColumnLabel(status: string) {
  if (status === "new") return "New enquiries";
  if (status === "follow_up") return "Contacting";
  if (status === "qualified") return "Qualified";
  if (status === "nurture") return "Nurture";
  return leadStatusLabel(status);
}

function formatQuoteStage(status: string) {
  return status
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function leadStatusOptionsFor(currentStatus: string) {
  const items = new Set<string>(manualLeadStatuses);
  items.add(currentStatus);
  return [...items];
}

function buildLeadHref(
  params: { owner?: string; q?: string; source?: string; status?: string },
  selected: string
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.source) search.set("source", params.source);
  if (params.owner) search.set("owner", params.owner);
  search.set("selected", selected);
  return `/leads?${search.toString()}`;
}

function pickLinkedName(value: unknown) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return pickLinkedName(value[0]);
  }

  if (typeof value === "object" && "full_name" in value) {
    return String((value as { full_name?: unknown }).full_name ?? "");
  }

  return "";
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#eef2e6] pb-3 last:border-b-0 last:pb-0">
      <span className="font-bold text-neutral-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
