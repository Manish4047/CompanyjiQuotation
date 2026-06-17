import { MessageSquareMore, Phone, Users } from "lucide-react";
import { linkConversationToLead, markConversationRead, sendWhatsappReply } from "@/app/(app)/whatsapp-inbox/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessConversationRecord,
  canManageLeadAssignments,
  canUseWhatsAppInbox,
  canViewAllLeads,
  formatLeadDateTime,
  leadFeatureWarningFromError
} from "@/lib/leads";
import { hasMetaWhatsappConfig } from "@/lib/whatsapp/meta";

type ConversationRow = {
  id: string;
  lead_id: string | null;
  wa_id: string | null;
  contact_name: string | null;
  phone: string | null;
  assigned_to: string | null;
  created_by: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  assigned_profile?: unknown;
  lead?: unknown;
};

type ConversationDetail = ConversationRow & {
  messages?: Array<{
    id: string;
    direction: string;
    message_status: string;
    message_type: string;
    body: string;
    error_text: string | null;
    created_at: string;
  }>;
};

type LeadOption = {
  id: string;
  lead_code: string;
  company_name: string;
};

export default async function WhatsAppInboxPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    selected?: string;
    success?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  if (!canUseWhatsAppInbox(profile.role)) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm font-bold uppercase text-[#6a912f]">WhatsApp inbox</p>
          <h1 className="mt-1 text-3xl font-black text-black">Inbox access</h1>
        </header>
        <Notice tone="red">Your current role cannot access the WhatsApp inbox.</Notice>
      </div>
    );
  }

  const supabase = createAdminClient();
  const [conversationResult, recentLeadResult] = await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .select(
        "id,lead_id,wa_id,contact_name,phone,assigned_to,created_by,last_message_preview,last_message_at,unread_count,assigned_profile:profiles!whatsapp_conversations_assigned_to_fkey(full_name),lead:leads(company_name,assigned_to,created_by,lead_code)"
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(250),
    canManageLeadAssignments(profile.role)
      ? supabase.from("leads").select("id,lead_code,company_name").order("updated_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null })
  ]);

  const warning = leadFeatureWarningFromError(conversationResult.error ?? recentLeadResult.error);
  if (warning) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm font-bold uppercase text-[#6a912f]">WhatsApp inbox</p>
          <h1 className="mt-1 text-3xl font-black text-black">Inbox</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Run the lead CRM migration before opening the shared WhatsApp inbox.
          </p>
        </header>
        <Notice tone="red">{warning}</Notice>
      </div>
    );
  }

  const allConversations = ((conversationResult.data ?? []) as ConversationRow[]).filter((conversation) =>
    canAccessConversationRecord(profile, {
      assigned_to: conversation.assigned_to,
      created_by: conversation.created_by,
      lead_assigned_to: pickLinkedValue(conversation.lead, "assigned_to"),
      lead_created_by: pickLinkedValue(conversation.lead, "created_by")
    })
  );
  const filteredConversations = filterConversations(allConversations, params, profile.id, canViewAllLeads(profile.role));
  const selectedId = params.selected || filteredConversations[0]?.id || allConversations[0]?.id || null;

  const selectedConversationResult = selectedId
    ? await supabase
        .from("whatsapp_conversations")
        .select(
          [
            "id,lead_id,wa_id,contact_name,phone,assigned_to,created_by,last_message_preview,last_message_at,unread_count",
            "assigned_profile:profiles!whatsapp_conversations_assigned_to_fkey(full_name)",
            "lead:leads(id,lead_code,company_name,assigned_to,created_by)",
            "messages:whatsapp_messages(id,direction,message_status,message_type,body,error_text,created_at)"
          ].join(",")
        )
        .eq("id", selectedId)
        .maybeSingle()
    : { data: null, error: null };

  const selectedConversationData =
    selectedConversationResult.data && typeof selectedConversationResult.data === "object"
      ? (selectedConversationResult.data as unknown as ConversationDetail)
      : null;
  const selectedConversation =
    selectedConversationData &&
    canAccessConversationRecord(profile, {
      assigned_to: selectedConversationData.assigned_to,
      created_by: selectedConversationData.created_by,
      lead_assigned_to: pickLinkedValue(selectedConversationData.lead, "assigned_to"),
      lead_created_by: pickLinkedValue(selectedConversationData.lead, "created_by")
    })
      ? selectedConversationData
      : null;

  const recentLeads = (recentLeadResult.data ?? []) as LeadOption[];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Shared WhatsApp desk</p>
          <h1 className="mt-1 text-3xl font-black text-black">WhatsApp inbox</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Incoming Meta Cloud API messages land here. Managers can triage, agents can reply only to conversations routed to their leads.
          </p>
        </div>
        <div className="text-sm text-neutral-600">
          {allConversations.length} conversations · {allConversations.filter((row) => row.unread_count > 0).length} unread
        </div>
      </header>

      {!hasMetaWhatsappConfig() ? (
        <Notice tone="red">
          Outbound sending is not active yet. Add `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, and
          `WHATSAPP_META_VERIFY_TOKEN` to enable replies.
        </Notice>
      ) : null}
      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <form className="grid gap-4">
                <Field label="Search">
                  <Input name="q" defaultValue={params.q ?? ""} placeholder="Phone, contact, lead, last message" />
                </Field>
                <Field label="View">
                  <Select name="view" defaultValue={params.view ?? "all"}>
                    <option value="all">All conversations</option>
                    <option value="unread">Unread first</option>
                    <option value="unlinked">Unlinked only</option>
                    <option value="mine">Only my queue</option>
                  </Select>
                </Field>
                {selectedConversation ? <input type="hidden" name="selected" value={selectedConversation.id} /> : null}
                <Button type="submit" variant="ghost">
                  Apply filters
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredConversations.length ? (
                filteredConversations.map((conversation) => {
                  const linkedLead = pickLinkedValue(conversation.lead, "company_name") || "Unlinked";
                  const href = buildConversationHref(params, conversation.id);
                  return (
                    <a
                      key={conversation.id}
                      href={href}
                      className={`block rounded-md border p-4 transition ${
                        selectedConversation?.id === conversation.id
                          ? "border-[#a0ce4e] bg-[#fbfcf8]"
                          : "border-[#e6ebdc] bg-white hover:border-[#a0ce4e]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-black">{conversation.contact_name || conversation.phone || conversation.wa_id}</p>
                          <p className="mt-1 truncate text-sm text-neutral-600">{linkedLead}</p>
                        </div>
                        {conversation.unread_count > 0 ? <StatusPill tone="green">{conversation.unread_count} unread</StatusPill> : null}
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-neutral-700">{conversation.last_message_preview || "No messages yet"}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-neutral-500">
                        <span>{conversation.phone || conversation.wa_id || "No number"}</span>
                        <span>{formatLeadDateTime(conversation.last_message_at)}</span>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                  Conversations will appear here after the Meta webhook starts sending messages into the CRM.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {selectedConversation ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#6a912f]">Conversation detail</p>
                    <h2 className="mt-1 text-2xl font-black text-black">
                      {selectedConversation.contact_name || selectedConversation.phone || selectedConversation.wa_id}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-600">
                      {selectedConversation.phone || selectedConversation.wa_id || "Number pending"} ·{" "}
                      {pickLinkedValue(selectedConversation.assigned_profile, "full_name") || "Unassigned"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={markConversationRead}>
                      <input type="hidden" name="conversation_id" value={selectedConversation.id} />
                      <Button variant="ghost">Mark read</Button>
                    </form>
                    {selectedConversation.lead_id ? (
                      <a href={`/leads?selected=${selectedConversation.lead_id}`}>
                        <Button variant="ghost">
                          <Users className="h-4 w-4" />
                          Open lead
                        </Button>
                      </a>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <SummaryCard label="Linked lead" value={pickLinkedValue(selectedConversation.lead, "company_name") || "Not linked"} />
                    <SummaryCard label="Unread" value={String(selectedConversation.unread_count)} />
                    <SummaryCard label="Last activity" value={formatLeadDateTime(selectedConversation.last_message_at)} />
                  </div>

                  {canManageLeadAssignments(profile.role) ? (
                    <form action={linkConversationToLead} className="grid gap-4 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
                      <input type="hidden" name="conversation_id" value={selectedConversation.id} />
                      <Field label="Link to lead">
                        <Select name="lead_id" defaultValue={selectedConversation.lead_id ?? ""}>
                          <option value="">Leave unlinked</option>
                          {recentLeads.map((lead) => (
                            <option key={lead.id} value={lead.id}>
                              {lead.company_name} · {lead.lead_code}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Button variant="ghost">Save link</Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Message history</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(selectedConversation.messages ?? []).length ? (
                      [...(selectedConversation.messages ?? [])]
                        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
                        .map((message) => (
                          <div
                            key={message.id}
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                              message.direction === "outbound"
                                ? "ml-auto bg-[#a0ce4e] text-black"
                                : message.direction === "system"
                                  ? "bg-neutral-100 text-neutral-700"
                                  : "bg-[#fbfcf8] text-neutral-900"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide">
                              <span>{message.direction}</span>
                              <span>{formatLeadDateTime(message.created_at)}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap">{message.body || `${message.message_type} message`}</p>
                            {message.error_text ? <p className="mt-2 text-[11px] text-[#8f1c13]">{message.error_text}</p> : null}
                            <div className="mt-2 text-[11px] opacity-80">{message.message_status}</div>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                        No messages are stored yet for this thread.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Reply</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form action={sendWhatsappReply} className="space-y-4">
                        <input type="hidden" name="conversation_id" value={selectedConversation.id} />
                        <Field label="Message">
                          <Textarea name="body" placeholder="Hi, sharing the update here..." className="min-h-40" />
                        </Field>
                        <Button>Send WhatsApp reply</Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Routing notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-neutral-700">
                      <FactRow label="Number">
                        <span className="inline-flex items-center gap-2">
                          <Phone className="h-4 w-4 text-neutral-400" />
                          {selectedConversation.phone || selectedConversation.wa_id || "Not available"}
                        </span>
                      </FactRow>
                      <FactRow label="Linked lead">
                        {selectedConversation.lead_id ? (
                          <a href={`/leads?selected=${selectedConversation.lead_id}`} className="font-bold text-[#6a912f]">
                            {pickLinkedValue(selectedConversation.lead, "company_name")}
                          </a>
                        ) : (
                          "Pending manager review"
                        )}
                      </FactRow>
                      <FactRow label="Owner">
                        {pickLinkedValue(selectedConversation.assigned_profile, "full_name") || "Unassigned"}
                      </FactRow>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#edf7df] text-[#47651d]">
                  <MessageSquareMore className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-lg font-black text-black">Choose a conversation</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Once the Meta webhook is live, replies, unread counts, and lead links will all be managed from here.
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

function filterConversations(
  rows: ConversationRow[],
  params: { q?: string; view?: string },
  profileId: string,
  _canViewEveryone: boolean
) {
  const query = String(params.q ?? "").trim().toLowerCase();
  const view = String(params.view ?? "all");

  return rows.filter((row) => {
    if (view === "unread" && row.unread_count <= 0) return false;
    if (view === "unlinked" && row.lead_id) return false;
    if (view === "mine" && row.assigned_to !== profileId && row.created_by !== profileId) {
      return false;
    }

    if (!query) return true;

    return [
      row.contact_name ?? "",
      row.phone ?? "",
      row.wa_id ?? "",
      row.last_message_preview ?? "",
      pickLinkedValue(row.lead, "company_name") || ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function buildConversationHref(params: { q?: string; view?: string }, selected: string) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.view) search.set("view", params.view);
  search.set("selected", selected);
  return `/whatsapp-inbox?${search.toString()}`;
}

function pickLinkedValue(value: unknown, key: string) {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return "";
  const result = (record as Record<string, unknown>)[key];
  return result == null ? "" : String(result);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
      <p className="text-xs font-bold uppercase text-neutral-500">{label}</p>
      <p className="mt-2 text-lg font-black text-black">{value}</p>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#eef2e6] pb-3 last:border-b-0 last:pb-0">
      <span className="font-bold text-neutral-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
