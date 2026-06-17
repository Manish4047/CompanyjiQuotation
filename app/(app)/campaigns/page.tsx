import {
  createCampaignDraft,
  createDripCampaign,
  enrollListInDrip,
  createMarketingList,
  deleteMarketingList,
  runDueDripsNow,
  updateCampaignStatus,
  updateDripCampaignStatus
} from "@/app/(app)/campaigns/actions";
import { DripCampaignBuilder } from "@/components/campaigns/drip-campaign-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { requireRole } from "@/lib/auth/session";
import { countDynamicListMembers, countManualListMembers, type MarketingListFilters } from "@/lib/marketing-lists";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

type MarketingListRow = {
  id: string;
  name: string;
  list_type: "manual" | "dynamic";
  filters: {
    tag?: string | null;
    folder_id?: string | null;
    category?: string | null;
    from?: string | null;
    to?: string | null;
    identifiers?: string[];
    service_ids?: string[] | null;
  } | null;
  active: boolean;
  created_at: string;
};

type CampaignRow = {
  id: string;
  name: string;
  channel: "email" | "whatsapp" | "both";
  status: "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled";
  subject: string | null;
  whatsapp_template_key: string | null;
  whatsapp_template_status: "draft" | "submitted" | "approved" | "rejected";
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  marketing_lists: { name: string } | null;
};

type DripCampaignRow = {
  id: string;
  name: string;
  campaign_type: string;
  trigger_type: string;
  channel: "email" | "whatsapp" | "both";
  status: "draft" | "active" | "paused" | "archived";
  approval_status: "draft" | "approved" | "needs_review";
  template_category: string;
  service_ids: string[] | null;
  require_all_services: boolean;
  min_quote_amount: number | null;
  max_quote_amount: number | null;
  inactivity_days: number | null;
  frequency_cap_days: number;
  created_at: string;
};

type DripStepRow = {
  campaign_id: string;
  step_order: number;
};

type DripEnrollmentRow = {
  campaign_id: string;
  status: "active" | "paused" | "stopped" | "completed";
  quotes:
    | {
        status: string | null;
      }
    | Array<{
        status: string | null;
      }>
    | null;
};

type DripEventRow = {
  campaign_id: string;
  event_type: "scheduled" | "sent" | "opened" | "clicked" | "replied" | "failed" | "skipped" | "stopped";
};

type ServiceRow = {
  id: string;
  name: string;
  category: string;
};

export default async function CampaignsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await requireRole(["admin", "manager"]);
  const isAdmin = profile.role === "admin";
  const params = await searchParams;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const [
    { data: listsData, error: listsError },
    { data: campaignsData, error: campaignsError },
    { data: foldersData },
    { data: tagCategoryData },
    { data: tagData },
    { data: servicesData },
    { data: dripCampaignData, error: dripCampaignsError },
    { data: dripStepData },
    { data: dripEnrollmentData },
    { data: dripEventData }
  ] = await Promise.all([
    supabase.from("marketing_lists").select("id,name,list_type,filters,active,created_at").order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("id,name,channel,status,subject,whatsapp_template_key,whatsapp_template_status,scheduled_at,sent_at,created_at,marketing_lists(name)")
      .order("created_at", { ascending: false }),
    supabase.from("quote_folders").select("id,name").eq("active", true).order("name"),
    supabase.from("pipeline_tag_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("pipeline_tags").select("id,name,category_id").eq("active", true).order("sort_order").order("name"),
    supabase.from("services").select("id,name,category").eq("active", true).order("category").order("name"),
    supabase
      .from("drip_campaigns")
      .select("id,name,campaign_type,trigger_type,channel,status,approval_status,template_category,service_ids,require_all_services,min_quote_amount,max_quote_amount,inactivity_days,frequency_cap_days,created_at")
      .order("created_at", { ascending: false }),
    supabase.from("drip_steps").select("campaign_id,step_order"),
    supabase.from("drip_enrollments").select("campaign_id,status,quotes(status)"),
    supabase.from("drip_events").select("campaign_id,event_type").order("occurred_at", { ascending: false }).limit(500)
  ]);

  const lists = (listsData ?? []) as MarketingListRow[];
  const campaigns = (campaignsData ?? []) as unknown as CampaignRow[];
  const dripCampaigns = (dripCampaignData ?? []) as DripCampaignRow[];
  const dripSteps = (dripStepData ?? []) as DripStepRow[];
  const dripEnrollments = (dripEnrollmentData ?? []) as DripEnrollmentRow[];
  const dripEvents = (dripEventData ?? []) as DripEventRow[];
  const folders = (foldersData ?? []) as Array<{ id: string; name: string }>;
  const services = (servicesData ?? []) as ServiceRow[];
  const serviceNameById = new Map(services.map((service) => [service.id, service.name]));
  const tagCategories = new Map(((tagCategoryData ?? []) as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
  const tags = ((tagData ?? []) as Array<{ id: string; name: string; category_id: string | null }>).map((tag) => ({
    ...tag,
    category_name: tag.category_id ? tagCategories.get(tag.category_id) ?? "General" : "General"
  }));
  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));

  const countedLists = await Promise.all(
    lists.map(async (list) => ({
      listId: list.id,
      count:
        list.list_type === "dynamic"
          ? await countDynamicListMembers(adminSupabase, (list.filters ?? {}) as MarketingListFilters)
          : await countManualListMembers(adminSupabase, list.id)
    }))
  );

  const memberCountByList = countedLists.reduce<Record<string, number>>((counts, item) => {
    counts[item.listId] = item.count;
    return counts;
  }, {});

  const stepCountByCampaign = dripSteps.reduce<Record<string, number>>((counts, step) => {
    counts[step.campaign_id] = (counts[step.campaign_id] ?? 0) + 1;
    return counts;
  }, {});

  const enrollmentCountByCampaign = dripEnrollments.reduce<Record<string, number>>((counts, enrollment) => {
    counts[enrollment.campaign_id] = (counts[enrollment.campaign_id] ?? 0) + 1;
    return counts;
  }, {});

  const convertedCountByCampaign = dripEnrollments.reduce<Record<string, number>>((counts, enrollment) => {
    const quoteStatus = normalizeQuoteStatus(enrollment.quotes);
    if (quoteStatus === "accepted") {
      counts[enrollment.campaign_id] = (counts[enrollment.campaign_id] ?? 0) + 1;
    }
    return counts;
  }, {});

  const spamCountByCampaign = dripEnrollments.reduce<Record<string, number>>((counts, enrollment) => {
    const quoteStatus = normalizeQuoteStatus(enrollment.quotes);
    if (quoteStatus === "spam") {
      counts[enrollment.campaign_id] = (counts[enrollment.campaign_id] ?? 0) + 1;
    }
    return counts;
  }, {});

  const eventCountByCampaign = dripEvents.reduce<Record<string, Record<string, number>>>((counts, event) => {
    counts[event.campaign_id] = counts[event.campaign_id] ?? {};
    counts[event.campaign_id][event.event_type] = (counts[event.campaign_id][event.event_type] ?? 0) + 1;
    return counts;
  }, {});

  const dripMetricCards = [
    {
      label: "Active drips",
      value: dripCampaigns.filter((campaign) => campaign.status === "active").length
    },
    {
      label: "Leads enrolled",
      value: dripEnrollments.filter((enrollment) => enrollment.status === "active" || enrollment.status === "paused").length
    },
    {
      label: "Messages sent",
      value: dripEvents.filter((event) => event.event_type === "sent").length
    },
    {
      label: "Opened",
      value: dripEvents.filter((event) => event.event_type === "opened").length
    },
    {
      label: "Replied",
      value: dripEvents.filter((event) => event.event_type === "replied").length
    },
    {
      label: "Converted",
      value: Object.values(convertedCountByCampaign).reduce((total, count) => total + count, 0)
    },
    {
      label: "Marked spam",
      value: Object.values(spamCountByCampaign).reduce((total, count) => total + count, 0)
    },
    {
      label: "Stopped",
      value: dripEnrollments.filter((enrollment) => enrollment.status === "stopped" || enrollment.status === "completed").length
    },
    {
      label: "Failed",
      value: dripEvents.filter((event) => event.event_type === "failed").length
    }
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Campaigns</p>
          <h1 className="mt-1 text-3xl font-black text-black">Lists, broadcasts, and drip automation</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-600">
            Build clean lead lists, send one-time campaigns, and create quotation follow-up drips that can start automatically after a quote is sent or manually for special leads.
          </p>
        </div>
        <form action={runDueDripsNow}>
          <Button type="submit">Run due drips now</Button>
        </form>
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}
      {listsError ? <Notice tone="red">{friendlyCampaignError(listsError.message)}</Notice> : null}
      {campaignsError ? <Notice tone="red">{friendlyCampaignError(campaignsError.message)}</Notice> : null}
      {dripCampaignsError ? <Notice tone="red">{friendlyCampaignError(dripCampaignsError.message)}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dripMetricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs font-black uppercase text-neutral-500">{card.label}</p>
              <p className="mt-2 text-2xl font-black text-black">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>New list</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createMarketingList} className="grid gap-3">
                <Field label="List name">
                  <Input name="name" placeholder="April incorporation leads" required />
                </Field>
                <Field label="List type">
                  <Select name="list_type" defaultValue="dynamic">
                    <option value="dynamic">Dynamic</option>
                    <option value="manual">Manual</option>
                  </Select>
                </Field>
                <Field label="Folder filter">
                  <Select name="filter_folder_id" defaultValue="">
                    <option value="">Any folder</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tag filter">
                  <Select name="filter_tag" defaultValue="">
                    <option value="">Any tag</option>
                    {groupTags(tags).map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.tags.map((tag) => (
                          <option key={tag.id} value={tag.name.toLowerCase()}>
                            {tag.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
                <Field label="Service filter">
                  <Select name="filter_service_id" defaultValue="">
                    <option value="">Any service</option>
                    {groupServices(services).map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
                <Field label="Pipeline category">
                  <Input name="filter_category" placeholder="Compliance" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Created from">
                    <Input name="filter_from" type="date" />
                  </Field>
                  <Field label="Created to">
                    <Input name="filter_to" type="date" />
                  </Field>
                </div>
                <Field label="Manual client codes / group IDs" hint="Use comma or new line separated values for manual lists.">
                  <Textarea className="min-h-24" name="manual_identifiers" placeholder={"C-2026-AAAAAA\nGRP-22"} />
                </Field>
                <Button type="submit">Create list</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>New broadcast campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createCampaignDraft} className="grid gap-3">
                <Field label="Campaign name">
                  <Input name="name" placeholder="GST reminder - April" required />
                </Field>
                <Field label="Target list">
                  <Select name="list_id" required defaultValue="">
                    <option value="">Select list</option>
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Channel">
                  <Select name="channel" defaultValue="both">
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="both">Both</option>
                  </Select>
                </Field>
                <Field label="Subject">
                  <Input name="subject" placeholder="Short email subject" />
                </Field>
                <Field label="WhatsApp template key">
                  <Input name="whatsapp_template_key" placeholder="quote_followup_opened" />
                </Field>
                <Field label="Template approval">
                  <Select name="whatsapp_template_status" defaultValue="draft">
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                </Field>
                <Field label="Schedule at">
                  <Input name="scheduled_at" type="datetime-local" />
                </Field>
                <Field label="Message">
                  <Textarea className="min-h-32" name="message" placeholder="Email body for email or combined campaigns" />
                </Field>
                <Field label="WhatsApp preview text">
                  <Textarea className="min-h-24" name="whatsapp_preview_text" placeholder="Short WhatsApp template preview text with variables" />
                </Field>
                <Button type="submit">Create campaign</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run a list through a drip</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={enrollListInDrip} className="grid gap-3">
                <Field label="List">
                  <Select name="list_id" required defaultValue="">
                    <option value="">Select list</option>
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Drip campaign">
                  <Select name="campaign_id" required defaultValue="">
                    <option value="">Select drip campaign</option>
                    {dripCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-xs leading-5 text-neutral-500">
                  This enrolls the latest usable quote for each lead in the selected list. Leads without a quote are skipped.
                </p>
                <Button type="submit">Enroll list into drip</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lists</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lists.map((list) => (
                <div key={list.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{list.name}</p>
                      <StatusPill>{list.list_type}</StatusPill>
                      <StatusPill tone={list.active ? "green" : "red"}>{list.active ? "active" : "inactive"}</StatusPill>
                      <StatusPill>{memberCountByList[list.id] ?? 0} clients</StatusPill>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isAdmin ? (
                        <>
                          <a
                            href={`/api/marketing-lists/${list.id}/export`}
                            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#d9ded1] bg-white px-3 text-sm font-black text-black"
                          >
                            Export CSV
                          </a>
                          <form action={deleteMarketingList}>
                            <input type="hidden" name="list_id" value={list.id} />
                            <Button type="submit" variant="danger">
                              Delete
                            </Button>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-neutral-500">Export is Admin only</span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">Created {formatDateTime(list.created_at)}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                    {list.filters?.folder_id ? <span>Folder: {folderNameById.get(list.filters.folder_id) ?? "Unknown"}</span> : null}
                    {list.filters?.tag ? <span>Tag: {list.filters.tag}</span> : null}
                    {list.filters?.category ? <span>Category: {list.filters.category}</span> : null}
                    {list.filters?.service_ids?.length
                      ? list.filters.service_ids.map((serviceId) => <span key={serviceId}>Service: {serviceNameById.get(serviceId) ?? "Unknown"}</span>)
                      : null}
                    {list.filters?.from ? <span>From: {list.filters.from}</span> : null}
                    {list.filters?.to ? <span>To: {list.filters.to}</span> : null}
                    {list.filters?.identifiers?.length ? <span>Manual identifiers: {list.filters.identifiers.length}</span> : null}
                  </div>
                </div>
              ))}
              {!lists.length ? <EmptyState text="No lists yet. Create your first manual or dynamic list." /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Broadcast campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_180px] lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">{campaign.name}</p>
                        <StatusPill>{campaign.channel}</StatusPill>
                        <StatusPill>{campaign.status}</StatusPill>
                      </div>
                      <p className="mt-2 text-sm text-neutral-600">List: {campaign.marketing_lists?.name ?? "Not set"}</p>
                      {campaign.subject ? <p className="mt-1 text-sm text-neutral-500">Subject: {campaign.subject}</p> : null}
                      {campaign.whatsapp_template_key ? (
                        <p className="mt-1 text-sm text-neutral-500">
                          WhatsApp template: {campaign.whatsapp_template_key} ({campaign.whatsapp_template_status})
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-neutral-500">
                        Scheduled {formatDateTime(campaign.scheduled_at)} | Sent {formatDateTime(campaign.sent_at)}
                      </p>
                    </div>
                    <form action={updateCampaignStatus} className="grid gap-2">
                      <input type="hidden" name="campaign_id" value={campaign.id} />
                      <Select name="status" defaultValue={campaign.status}>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="sending">Sending</option>
                        <option value="sent">Sent</option>
                        <option value="paused">Paused</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                      <Button type="submit" variant="ghost">
                        Update status
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
              {!campaigns.length ? <EmptyState text="No broadcast campaigns yet." /> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <DripCampaignBuilder services={services} action={createDripCampaign} />

      <Card>
        <CardHeader>
          <CardTitle>Drip campaigns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dripCampaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-black">{campaign.name}</p>
                    <StatusPill>{campaign.campaign_type.replaceAll("_", " ")}</StatusPill>
                    <StatusPill>{campaign.trigger_type.replaceAll("_", " ")}</StatusPill>
                    <StatusPill>{campaign.channel}</StatusPill>
                    <StatusPill tone={campaign.status === "active" ? "green" : campaign.status === "paused" ? "amber" : "black"}>
                      {campaign.status}
                    </StatusPill>
                    <StatusPill>{campaign.approval_status.replaceAll("_", " ")}</StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span>{stepCountByCampaign[campaign.id] ?? 0} steps</span>
                    <span>{enrollmentCountByCampaign[campaign.id] ?? 0} enrolled</span>
                    <span>Frequency cap {campaign.frequency_cap_days} days</span>
                    {campaign.min_quote_amount ? <span>Min amount ₹{campaign.min_quote_amount.toLocaleString("en-IN")}</span> : null}
                    {campaign.max_quote_amount ? <span>Max amount ₹{campaign.max_quote_amount.toLocaleString("en-IN")}</span> : null}
                    {campaign.inactivity_days ? <span>Inactive after {campaign.inactivity_days} days</span> : null}
                    {campaign.require_all_services ? <span>Requires all services</span> : null}
                  </div>
                  {campaign.service_ids?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {campaign.service_ids.map((serviceId) => (
                        <StatusPill key={serviceId}>{serviceNameById.get(serviceId) ?? "Unknown service"}</StatusPill>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-neutral-500">Created {formatDateTime(campaign.created_at)}</p>
                </div>
                <form action={updateDripCampaignStatus} className="grid gap-2">
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <Select name="status" defaultValue={campaign.status}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </Select>
                  <Button type="submit" variant="ghost">
                    Update status
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {!dripCampaigns.length ? <EmptyState text="No drip campaigns yet. Build the first follow-up flow above." /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Drip MIS</CardTitle>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            Quick management view for enrollments, opens, replies, conversion, spam, and failures across each drip.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead className="bg-[#f8f9f4] text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-3 font-black">Campaign</th>
                  <th className="px-3 py-3 font-black">Enrolled</th>
                  <th className="px-3 py-3 font-black">Sent</th>
                  <th className="px-3 py-3 font-black">Opened</th>
                  <th className="px-3 py-3 font-black">Replied</th>
                  <th className="px-3 py-3 font-black">Converted</th>
                  <th className="px-3 py-3 font-black">Spam</th>
                  <th className="px-3 py-3 font-black">Failed</th>
                  <th className="px-3 py-3 font-black">Stopped</th>
                </tr>
              </thead>
              <tbody>
                {dripCampaigns.map((campaign) => {
                  const eventCounts = eventCountByCampaign[campaign.id] ?? {};
                  return (
                    <tr key={`mis-${campaign.id}`} className="border-t border-[#eef1e7]">
                      <td className="px-3 py-3">
                        <p className="font-black text-black">{campaign.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {campaign.channel} | {campaign.template_category}
                        </p>
                      </td>
                      <td className="px-3 py-3">{enrollmentCountByCampaign[campaign.id] ?? 0}</td>
                      <td className="px-3 py-3">{eventCounts.sent ?? 0}</td>
                      <td className="px-3 py-3">{eventCounts.opened ?? 0}</td>
                      <td className="px-3 py-3">{eventCounts.replied ?? 0}</td>
                      <td className="px-3 py-3">{convertedCountByCampaign[campaign.id] ?? 0}</td>
                      <td className="px-3 py-3">{spamCountByCampaign[campaign.id] ?? 0}</td>
                      <td className="px-3 py-3">{eventCounts.failed ?? 0}</td>
                      <td className="px-3 py-3">{eventCounts.stopped ?? 0}</td>
                    </tr>
                  );
                })}
                {!dripCampaigns.length ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-neutral-500">
                      No drip campaigns yet. Build the first follow-up flow above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Notice({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md border p-4 text-sm font-semibold ${
        tone === "green" ? "border-[#d9ead3] bg-[#edf7df] text-[#405f16]" : "border-[#f4c7c3] bg-[#fff0ed] text-[#b42318]"
      }`}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">{text}</div>;
}

function friendlyCampaignError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("quote_folders") || lower.includes("pipeline_tags") || lower.includes("pipeline_tag_categories")) {
    return "Folders or defined tags are missing. Run migration 0006 in Supabase SQL Editor.";
  }
  if (lower.includes("drip_campaigns") || lower.includes("drip_steps") || lower.includes("drip_enrollments") || lower.includes("drip_events")) {
    return "Drip automation tables are missing. Run migration 0007 in Supabase SQL Editor.";
  }
  if (lower.includes("whatsapp_template")) {
    return "WhatsApp template fields are missing. Run migration 0008 in Supabase SQL Editor.";
  }
  if (lower.includes("relation") || lower.includes("column") || lower.includes("schema cache")) {
    return "Campaign tables are missing. Run migrations 0005, 0006, 0007, and 0008 in Supabase SQL Editor.";
  }
  return message;
}

function groupTags(tags: Array<{ id: string; name: string; category_name: string }>) {
  const grouped = tags.reduce<Record<string, Array<{ id: string; name: string }>>>((groups, tag) => {
    groups[tag.category_name] = [...(groups[tag.category_name] ?? []), { id: tag.id, name: tag.name }];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupTags]) => ({
      category,
      tags: groupTags.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function groupServices(services: ServiceRow[]) {
  const grouped = services.reduce<Record<string, ServiceRow[]>>((groups, service) => {
    groups[service.category] = [...(groups[service.category] ?? []), service];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupServices]) => ({
      category,
      services: groupServices.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function normalizeQuoteStatus(
  value:
    | {
        status: string | null;
      }
    | Array<{
        status: string | null;
      }>
    | null
) {
  if (!value) return "";
  if (Array.isArray(value)) return value[0]?.status ?? "";
  return value.status ?? "";
}
