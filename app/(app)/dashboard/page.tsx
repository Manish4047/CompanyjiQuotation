import Link from "next/link";
import { ArrowRight, Clock, FileText, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { canAccessConversationRecord, canAccessLeadRecord, leadFeatureWarningFromError, leadStatusLabel, leadStatusTone } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, quoteStatusTone } from "@/lib/utils";

type RecentQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  currency_code: string;
  total_amount: number;
  validity_date: string;
  clients: { name: string } | null;
  service_requested: string[];
};

type FollowupQuote = {
  id: string;
  quote_id_formatted: string;
  status: string;
  followup_date: string | null;
  clients: { name: string } | null;
  service_requested: string[];
};

type LeadDashboardSnapshot = {
  dueReminderCount: number;
  dueReminders: Array<{
    company_name: string;
    due_at: string;
    id: string;
    lead_id: string;
    note: string | null;
  }>;
  leadCount: number;
  openConversationCount: number;
  recentLeads: Array<{
    company_name: string;
    id: string;
    next_follow_up_at: string | null;
    source: string;
    status: string;
  }>;
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);

  const [
    { count: quoteCount },
    { count: clientCount },
    { count: serviceCount },
    { data: recentQuotes },
    { data: todayFollowups },
    leadSnapshot
  ] = await Promise.all([
    supabase.from("quotes").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("services").select("*", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("quotes")
      .select("id,quote_id_formatted,status,currency_code,total_amount,validity_date,clients(name),quotes_services(services(name))")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("quotes")
      .select("id,quote_id_formatted,status,followup_date,clients(name),quotes_services(services(name))")
      .eq("followup_date", todayIso)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(8),
    loadLeadDashboardSnapshot(profile)
  ]);

  const quotes = ((recentQuotes ?? []) as unknown as Array<Omit<RecentQuote, "clients" | "service_requested"> & { clients?: unknown; quotes_services?: unknown }>).map(
    (quote) => ({
      ...quote,
      clients: normalizeLinkedClient(quote.clients),
      service_requested: normalizeServiceNames(quote.quotes_services)
    })
  );

  const followups = ((todayFollowups ?? []) as unknown as Array<
    Omit<FollowupQuote, "clients" | "service_requested"> & { clients?: unknown; quotes_services?: unknown }
  >).map((quote) => ({
    ...quote,
    clients: normalizeLinkedClient(quote.clients),
    service_requested: normalizeServiceNames(quote.quotes_services)
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Workspace</p>
          <h1 className="mt-1 text-3xl font-black text-black">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Keep quotes moving without sounding pushy. The goal is speed, clarity, and honest follow-up.
          </p>
        </div>
        <Link href="/quotes/new">
          <Button>
            New quote
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Quotes" value={quoteCount ?? 0} icon={<FileText className="h-5 w-5" />} />
        <Metric title="Clients" value={clientCount ?? 0} icon={<Users className="h-5 w-5" />} />
        <Metric title="Active services" value={serviceCount ?? 0} icon={<ShieldCheck className="h-5 w-5" />} />
      </section>

      {leadSnapshot ? (
        <section className="grid gap-4 md:grid-cols-3">
          <Metric title="Leads" value={leadSnapshot.leadCount} icon={<Users className="h-5 w-5" />} />
          <Metric title="Due reminders" value={leadSnapshot.dueReminderCount} icon={<Clock className="h-5 w-5" />} />
          <Metric title="Inbox threads" value={leadSnapshot.openConversationCount} icon={<FileText className="h-5 w-5" />} />
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent quotes</CardTitle>
            <Link href="/pipeline" className="text-sm font-bold text-[#6a912f]">
              Open pipeline
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotes.length ? (
              quotes.map((quote) => (
                <div key={quote.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-bold text-black">
                        {quote.quote_id_formatted} · {quote.clients?.name ?? "Client"}
                      </p>
                      <p className="mt-1 text-sm text-neutral-700">{formatServiceRequested(quote.service_requested)}</p>
                      <p className="mt-1 text-sm text-neutral-500">Valid until {formatDate(quote.validity_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill tone={quoteStatusTone(quote.status)}>{quote.status.replaceAll("_", " ")}</StatusPill>
                      <p className="font-black">{formatCurrency(quote.total_amount, quote.currency_code)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No quotes yet" text="Create the first quote from the New Quote screen." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s focus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {followups.length ? (
              followups.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 transition hover:border-[#a0ce4e] hover:bg-white"
                >
                  <div className="flex gap-3">
                    <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-black text-white">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-black">
                            {quote.clients?.name ?? "Client"} · {quote.quote_id_formatted}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm text-neutral-700">
                            {formatServiceRequested(quote.service_requested)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">Follow-up for today</p>
                        </div>
                        <StatusPill tone={quoteStatusTone(quote.status)}>{quote.status.replaceAll("_", " ")}</StatusPill>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState title="No follow-ups due today" text="The dashboard is clear for now. New due items will show here automatically." />
            )}
          </CardContent>
        </Card>
      </section>

      {leadSnapshot ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent leads</CardTitle>
              <a href="/leads" className="text-sm font-bold text-[#6a912f]">
                Open leads
              </a>
            </CardHeader>
            <CardContent className="space-y-3">
              {leadSnapshot.recentLeads.length ? (
                leadSnapshot.recentLeads.map((lead) => (
                  <a
                    key={lead.id}
                    href={`/leads?selected=${lead.id}`}
                    className="block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 transition hover:border-[#a0ce4e]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-black">{lead.company_name}</p>
                        <p className="mt-1 text-sm text-neutral-600">{lead.source}</p>
                      </div>
                      <StatusPill tone={leadStatusTone(lead.status)}>{leadStatusLabel(lead.status)}</StatusPill>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      Next follow-up {lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "not set"}
                    </p>
                  </a>
                ))
              ) : (
                <EmptyState title="No recent leads" text="New lead assignments will show here once the team starts using the lead workspace." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Due lead reminders</CardTitle>
              <a href="/whatsapp-inbox" className="text-sm font-bold text-[#6a912f]">
                Open inbox
              </a>
            </CardHeader>
            <CardContent className="space-y-3">
              {leadSnapshot.dueReminders.length ? (
                leadSnapshot.dueReminders.map((reminder) => (
                  <a
                    key={reminder.id}
                    href={`/leads?selected=${reminder.lead_id}`}
                    className="block rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4 transition hover:border-[#a0ce4e]"
                  >
                    <p className="font-bold text-black">{reminder.company_name}</p>
                    <p className="mt-1 text-sm text-neutral-700">{reminder.note || "Follow-up due now"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(reminder.due_at)}</p>
                  </a>
                ))
              ) : (
                <EmptyState title="No due reminders" text="The callback queue is clear right now." />
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-neutral-500">{title}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-md bg-[#edf7df] text-[#47651d]">{icon}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function normalizeServiceNames(value: unknown) {
  if (!Array.isArray(value)) return [];

  const names = value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const services = (entry as { services?: unknown }).services;
      if (Array.isArray(services)) return services;
      return services ? [services] : [];
    })
    .map((service) => {
      if (!service || typeof service !== "object") return null;
      const name = String((service as { name?: unknown }).name ?? "").trim();
      return name || null;
    })
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

function formatServiceRequested(services: string[]) {
  if (!services.length) return "Service not set";
  if (services.length <= 2) return services.join(", ");
  return `${services[0]}, ${services[1]} +${services.length - 2} more`;
}

function normalizeLinkedClient(value: unknown) {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  const name = String((record as { name?: unknown }).name ?? "").trim();
  return name ? { name } : null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function loadLeadDashboardSnapshot(profile: Awaited<ReturnType<typeof requireProfile>>): Promise<LeadDashboardSnapshot | null> {
  try {
    const supabase = createAdminClient();
    const [leadResult, reminderResult, conversationResult] = await Promise.all([
      supabase
        .from("leads")
        .select("id,company_name,status,source,next_follow_up_at,assigned_to,created_by,updated_at")
        .order("updated_at", { ascending: false })
        .limit(250),
      supabase
        .from("lead_reminders")
        .select("id,lead_id,due_at,note,status,assigned_to,leads(company_name)")
        .eq("status", "pending")
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(50),
      supabase
        .from("whatsapp_conversations")
        .select("id,assigned_to,created_by,unread_count,lead:leads(assigned_to,created_by)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100)
    ]);

    const warning = leadFeatureWarningFromError(leadResult.error ?? reminderResult.error ?? conversationResult.error);
    if (warning) return null;

    const visibleLeads = ((leadResult.data ?? []) as Array<{
      assigned_to: string | null;
      company_name: string;
      created_by: string | null;
      id: string;
      next_follow_up_at: string | null;
      source: string;
      status: string;
      updated_at: string;
    }>).filter((lead) => canAccessLeadRecord(profile, lead));

    const visibleLeadIds = new Set(visibleLeads.map((lead) => lead.id));
    const dueReminders = ((reminderResult.data ?? []) as Array<{
      due_at: string;
      id: string;
      lead_id: string;
      leads?: unknown;
      note: string | null;
    }>)
      .filter((reminder) => visibleLeadIds.has(reminder.lead_id))
      .map((reminder) => ({
        company_name: normalizeLeadName(reminder.leads),
        due_at: reminder.due_at,
        id: reminder.id,
        lead_id: reminder.lead_id,
        note: reminder.note
      }));

    const openConversationCount = ((conversationResult.data ?? []) as Array<{
      assigned_to: string | null;
      created_by: string | null;
      id: string;
      lead?: unknown;
      unread_count: number;
    }>).filter((conversation) =>
      canAccessConversationRecord(profile, {
        assigned_to: conversation.assigned_to,
        created_by: conversation.created_by,
        lead_assigned_to: normalizeLinkedField(conversation.lead, "assigned_to"),
        lead_created_by: normalizeLinkedField(conversation.lead, "created_by")
      })
    ).length;

    return {
      dueReminderCount: dueReminders.length,
      dueReminders: dueReminders.slice(0, 6),
      leadCount: visibleLeads.length,
      openConversationCount,
      recentLeads: visibleLeads.slice(0, 5).map((lead) => ({
        company_name: lead.company_name,
        id: lead.id,
        next_follow_up_at: lead.next_follow_up_at,
        source: lead.source,
        status: lead.status
      }))
    };
  } catch (error) {
    if (leadFeatureWarningFromError(error)) return null;
    throw error;
  }
}

function normalizeLeadName(value: unknown) {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return "Lead";
  return String((record as { company_name?: unknown }).company_name ?? "Lead");
}

function normalizeLinkedField(value: unknown, key: string) {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  const result = (record as Record<string, unknown>)[key];
  return result == null ? null : String(result);
}
