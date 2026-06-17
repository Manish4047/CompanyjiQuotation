alter table public.services
  add column if not exists extra_costs_clause text not null default 'Government fees, if any, and out-of-pocket expenditure, if any, shall be extra.',
  add column if not exists is_addon_template boolean not null default false;

alter table public.clients
  add column if not exists tags text[] not null default '{}',
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists last_synced_at timestamptz;

create unique index if not exists clients_external_source_id_idx
on public.clients(external_source, external_id)
where external_source is not null and external_id is not null;

alter table public.quotes
  add column if not exists custom_service_items jsonb not null default '[]',
  add column if not exists service_fee_overrides jsonb not null default '{}',
  add column if not exists show_service_breakup boolean not null default true,
  add column if not exists include_extra_costs_clause boolean not null default true,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists total_before_gst integer not null default 0,
  add column if not exists gst_rate_percent numeric(5,2) not null default 0,
  add column if not exists gst_base_amount integer,
  add column if not exists gst_amount integer not null default 0,
  add column if not exists prepaid_total_amount integer not null default 0,
  add column if not exists postpaid_total_amount integer not null default 0,
  add column if not exists required_documents_snapshot text,
  add column if not exists preview_overrides jsonb not null default '{}',
  add column if not exists tags text[] not null default '{}';

create index if not exists clients_tags_idx on public.clients using gin(tags);
create index if not exists quotes_tags_idx on public.quotes using gin(tags);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  recipient_email text,
  subject text,
  provider text,
  template_key text,
  status text not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.email_events enable row level security;

drop policy if exists "email events read by quote access" on public.email_events;
create policy "email events read by quote access"
on public.email_events for select
to authenticated
using (
  public.is_manager_or_admin()
  or exists (
    select 1
    from public.quotes q
    where q.id = quote_id
      and (q.assigned_to = auth.uid() or q.created_by = auth.uid())
  )
);

drop policy if exists "email events insert team" on public.email_events;
create policy "email events insert team"
on public.email_events for insert
to authenticated
with check (public.current_role() in ('admin', 'manager', 'sales'));

drop policy if exists "settings read team safe keys" on public.app_settings;
create policy "settings read team safe keys"
on public.app_settings for select
to authenticated
using (key in ('quote_footer'));

insert into public.app_settings (key, value)
values (
  'quote_footer',
  '{
    "assistanceLabel": "Assistance",
    "assistancePhone": "+91 86479 33633",
    "consultancyLabel": "Consultancy",
    "consultancyPhone": "+91 98310 13711",
    "whatsappLabel": "WhatsApp",
    "whatsappPhone": "+91 91436 88884",
    "footerLine": "Companyji - Smart Business Solutions - Kolkata"
  }'::jsonb
)
on conflict (key) do nothing;
