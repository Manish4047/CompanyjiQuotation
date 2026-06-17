create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'manager', 'sales', 'executive', 'shared_office');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.client_status as enum ('active_lead', 'won', 'lost', 'lost_nurture', 'dormant', 'blacklisted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.quote_status as enum ('draft', 'sent', 'viewed', 'negotiating', 'accepted', 'expired', 'refresh_requested', 'lost', 'lost_nurture', 'dormant', 'spam', 'superseded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pricing_mode as enum ('fixed', 'engagement_based');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.plan_choice as enum ('prepaid', 'postpaid', 'not_yet_chosen');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'sales',
  active boolean not null default true,
  phone text,
  joined_at timestamptz not null default now(),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.office_attribution_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  surcharge integer not null default 0,
  reason text,
  notes text
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  pricing_mode public.pricing_mode not null default 'fixed',
  short_description text not null default '',
  full_description text not null default '',
  prepaid_fee integer not null default 0,
  postpaid_fee integer not null default 0,
  prepaid_description text not null default 'Full payment upfront. Work begins after payment confirms.',
  postpaid_description text not null default 'No advance. Payment is due after the agreed milestone.',
  first_installment integer,
  first_trigger text,
  second_trigger text,
  timeline_best text,
  timeline_typical text,
  timeline_worst text,
  inclusions text not null default '',
  not_included text not null default '',
  required_documents text not null default '',
  extra_costs_clause text not null default 'Government fees, if any, and out-of-pocket expenditure, if any, shall be extra.',
  state_variations_apply boolean not null default false,
  is_addon_template boolean not null default false,
  active boolean not null default true,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tc_clauses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_facing_text text not null,
  trigger_type text not null check (trigger_type in ('always', 'conditional', 'manual')),
  condition_expression text,
  category text not null check (category in ('pricing', 'timeline', 'scope', 'refund', 'legal', 'other')),
  order_priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tc_clauses_services (
  clause_id uuid not null references public.tc_clauses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (clause_id, service_id)
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  category_id uuid,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, name)
);

create table if not exists public.service_document_templates (
  service_id uuid not null references public.services(id) on delete cascade,
  document_template_id uuid not null references public.document_templates(id) on delete cascade,
  primary key (service_id, document_template_id)
);

create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.document_templates
    add constraint document_templates_category_id_fkey
    foreign key (category_id)
    references public.document_categories(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.canned_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'General',
  body text not null,
  use_case text not null default 'quote_note',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, title)
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_initial text,
  company_name text,
  client_type text,
  service_id uuid references public.services(id) on delete set null,
  testimonial_text text not null,
  outcome text,
  date_received date,
  use_in_drip boolean not null default false,
  use_on_quote boolean not null default true,
  reference_ok boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  group_id text,
  name text not null,
  client_type text,
  source text,
  status public.client_status not null default 'active_lead',
  duplicate_status text,
  tags text[] not null default '{}',
  external_source text,
  external_id text,
  last_synced_at timestamptz,
  acquired_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_interaction_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_details (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  primary_email text,
  secondary_email text,
  historical_emails text[] not null default '{}',
  primary_mobile text,
  secondary_mobile text,
  historical_mobiles text[] not null default '{}',
  whatsapp_number text,
  whatsapp_consent boolean not null default false,
  preferred_channel text check (preferred_channel in ('email', 'whatsapp', 'phone', 'sms')),
  do_not_contact boolean not null default false,
  opt_outs text[] not null default '{}',
  last_updated timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  company_type text not null,
  cin text,
  incorporation_date date,
  state_id uuid references public.states(id) on delete set null,
  authorized_capital integer,
  paid_up_capital integer,
  pan text,
  tan text,
  gst_number text,
  owner_client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies_other_directors (
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (company_id, client_id)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_id_formatted text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null references public.clients(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  plan_chosen public.plan_choice not null default 'postpaid',
  state_id uuid references public.states(id) on delete set null,
  subtotal integer not null default 0,
  state_variation_add integer not null default 0,
  addon_items jsonb not null default '[]',
  custom_service_items jsonb not null default '[]',
  service_fee_overrides jsonb not null default '{}',
  show_service_breakup boolean not null default true,
  include_extra_costs_clause boolean not null default true,
  addon_total integer not null default 0,
  discount_amount integer not null default 0,
  total_before_gst integer not null default 0,
  gst_rate_percent numeric(5,2) not null default 0,
  gst_base_amount integer,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  prepaid_total_amount integer not null default 0,
  postpaid_total_amount integer not null default 0,
  include_prepaid_plan boolean not null default true,
  include_postpaid_plan boolean not null default true,
  recommended_plan public.plan_choice not null default 'postpaid',
  required_documents_snapshot text,
  document_items jsonb not null default '[]',
  canned_note_items jsonb not null default '[]',
  other_fee_items jsonb not null default '[]',
  other_fee_total integer not null default 0,
  preview_overrides jsonb not null default '{}',
  custom_note text,
  validity_date date not null default (current_date + 15),
  status public.quote_status not null default 'draft',
  sent_date timestamptz,
  sent_via text[] not null default '{}',
  first_opened timestamptz,
  open_count integer not null default 0,
  last_opened timestamptz,
  link_clicked timestamptz,
  won_date timestamptz,
  lost_date timestamptz,
  lost_reason text,
  lost_detail text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  drip_stage text,
  next_drip_date date,
  drip_paused_until timestamptz,
  source_entry text,
  parent_quote_id uuid references public.quotes(id) on delete set null,
  internal_notes text,
  tags text[] not null default '{}',
  public_token uuid not null default gen_random_uuid()
);

create table if not exists public.quotes_services (
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  fee_snapshot integer not null default 0,
  primary key (quote_id, service_id)
);

create table if not exists public.quotes_tc_clauses (
  quote_id uuid not null references public.quotes(id) on delete cascade,
  clause_id uuid not null references public.tc_clauses(id) on delete restrict,
  primary key (quote_id, clause_id)
);

create table if not exists public.compliance_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deadline_type text not null,
  due_date date not null,
  reminder_15 date generated always as (due_date - 15) stored,
  reminder_7 date generated always as (due_date - 7) stored,
  reminder_3 date generated always as (due_date - 3) stored,
  status text not null default 'upcoming',
  filed_date date,
  recurring boolean not null default false,
  next_occurrence date,
  assigned_to uuid references public.profiles(id) on delete set null,
  client_notified boolean not null default false,
  last_reminder_sent timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  action_type text not null,
  related_client_id uuid references public.clients(id) on delete set null,
  related_quote_id uuid references public.quotes(id) on delete set null,
  details jsonb not null default '{}',
  ip_address inet
);

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

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists clients_assigned_to_idx on public.clients(assigned_to);
create index if not exists clients_group_id_idx on public.clients(group_id);
create index if not exists clients_tags_idx on public.clients using gin(tags);
create unique index if not exists clients_external_source_id_idx on public.clients(external_source, external_id)
where external_source is not null and external_id is not null;
create index if not exists clients_name_idx on public.clients using gin (to_tsvector('simple', name));
create index if not exists document_templates_category_id_idx on public.document_templates(category_id);
create index if not exists quotes_client_id_idx on public.quotes(client_id);
create index if not exists quotes_status_idx on public.quotes(status);
create index if not exists quotes_assigned_to_idx on public.quotes(assigned_to);
create index if not exists quotes_tags_idx on public.quotes using gin(tags);
create index if not exists activity_log_timestamp_idx on public.activity_log(timestamp desc);
create index if not exists activity_log_user_idx on public.activity_log(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('admin', 'manager'), false)
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_manager_or_admin()
    or exists (
      select 1
      from public.clients c
      where c.id = target_client_id
        and c.assigned_to = auth.uid()
    )
$$;

create or replace function public.log_activity(
  action_type text,
  related_client_id uuid default null,
  related_quote_id uuid default null,
  details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  actor_email text;
begin
  select email into actor_email
  from public.profiles
  where id = auth.uid();

  insert into public.activity_log (user_id, user_email, action_type, related_client_id, related_quote_id, details)
  values (auth.uid(), actor_email, action_type, related_client_id, related_quote_id, coalesce(details, '{}'::jsonb))
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.generate_client_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code = 'C-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

create or replace function public.generate_company_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code = 'CO-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

create or replace function public.generate_quote_code()
returns trigger
language plpgsql
as $$
begin
  if new.quote_id_formatted is null or new.quote_id_formatted = '' then
    new.quote_id_formatted = 'Q-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();

drop trigger if exists tc_clauses_updated_at on public.tc_clauses;
create trigger tc_clauses_updated_at before update on public.tc_clauses for each row execute function public.set_updated_at();

drop trigger if exists document_templates_updated_at on public.document_templates;
create trigger document_templates_updated_at before update on public.document_templates for each row execute function public.set_updated_at();

drop trigger if exists document_categories_updated_at on public.document_categories;
create trigger document_categories_updated_at before update on public.document_categories for each row execute function public.set_updated_at();

drop trigger if exists canned_messages_updated_at on public.canned_messages;
create trigger canned_messages_updated_at before update on public.canned_messages for each row execute function public.set_updated_at();

drop trigger if exists testimonials_updated_at on public.testimonials;
create trigger testimonials_updated_at before update on public.testimonials for each row execute function public.set_updated_at();

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();

drop trigger if exists clients_generate_code on public.clients;
create trigger clients_generate_code before insert on public.clients for each row execute function public.generate_client_code();

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();

drop trigger if exists companies_generate_code on public.companies;
create trigger companies_generate_code before insert on public.companies for each row execute function public.generate_company_code();

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();

drop trigger if exists quotes_generate_code on public.quotes;
create trigger quotes_generate_code before insert on public.quotes for each row execute function public.generate_quote_code();

alter table public.profiles enable row level security;
alter table public.office_attribution_users enable row level security;
alter table public.states enable row level security;
alter table public.services enable row level security;
alter table public.tc_clauses enable row level security;
alter table public.tc_clauses_services enable row level security;
alter table public.document_templates enable row level security;
alter table public.document_categories enable row level security;
alter table public.service_document_templates enable row level security;
alter table public.canned_messages enable row level security;
alter table public.testimonials enable row level security;
alter table public.clients enable row level security;
alter table public.contact_details enable row level security;
alter table public.companies enable row level security;
alter table public.companies_other_directors enable row level security;
alter table public.quotes enable row level security;
alter table public.quotes_services enable row level security;
alter table public.quotes_tc_clauses enable row level security;
alter table public.compliance_schedules enable row level security;
alter table public.activity_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.email_events enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert"
on public.profiles for insert
to authenticated
with check (public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reference read authenticated states" on public.states;
create policy "reference read authenticated states"
on public.states for select
to authenticated
using (true);

drop policy if exists "reference insert admin states" on public.states;
create policy "reference insert admin states"
on public.states for insert
to authenticated
with check (public.is_admin());

drop policy if exists "reference update admin states" on public.states;
create policy "reference update admin states"
on public.states for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "services read authenticated" on public.services;
create policy "services read authenticated"
on public.services for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "services admin insert" on public.services;
create policy "services admin insert"
on public.services for insert
to authenticated
with check (public.is_admin());

drop policy if exists "services admin update" on public.services;
create policy "services admin update"
on public.services for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "services admin delete" on public.services;
create policy "services admin delete"
on public.services for delete
to authenticated
using (public.is_admin());

drop policy if exists "tc read authenticated" on public.tc_clauses;
create policy "tc read authenticated"
on public.tc_clauses for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "tc admin insert" on public.tc_clauses;
create policy "tc admin insert"
on public.tc_clauses for insert
to authenticated
with check (public.is_admin());

drop policy if exists "tc admin update" on public.tc_clauses;
create policy "tc admin update"
on public.tc_clauses for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tc service read authenticated" on public.tc_clauses_services;
create policy "tc service read authenticated"
on public.tc_clauses_services for select
to authenticated
using (true);

drop policy if exists "tc service admin write" on public.tc_clauses_services;
create policy "tc service admin write"
on public.tc_clauses_services for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "document templates read authenticated" on public.document_templates;
create policy "document templates read authenticated"
on public.document_templates for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "document templates admin insert" on public.document_templates;
create policy "document templates admin insert"
on public.document_templates for insert
to authenticated
with check (public.is_admin());

drop policy if exists "document templates admin update" on public.document_templates;
create policy "document templates admin update"
on public.document_templates for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "document templates admin delete" on public.document_templates;
create policy "document templates admin delete"
on public.document_templates for delete
to authenticated
using (public.is_admin());

drop policy if exists "document categories read authenticated" on public.document_categories;
create policy "document categories read authenticated"
on public.document_categories for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "document categories admin insert" on public.document_categories;
create policy "document categories admin insert"
on public.document_categories for insert
to authenticated
with check (public.is_admin());

drop policy if exists "document categories admin update" on public.document_categories;
create policy "document categories admin update"
on public.document_categories for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "document categories admin delete" on public.document_categories;
create policy "document categories admin delete"
on public.document_categories for delete
to authenticated
using (public.is_admin());

drop policy if exists "service document links read authenticated" on public.service_document_templates;
create policy "service document links read authenticated"
on public.service_document_templates for select
to authenticated
using (true);

drop policy if exists "service document links admin write" on public.service_document_templates;
create policy "service document links admin write"
on public.service_document_templates for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "canned messages read authenticated" on public.canned_messages;
create policy "canned messages read authenticated"
on public.canned_messages for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "canned messages admin insert" on public.canned_messages;
create policy "canned messages admin insert"
on public.canned_messages for insert
to authenticated
with check (public.is_admin());

drop policy if exists "canned messages admin update" on public.canned_messages;
create policy "canned messages admin update"
on public.canned_messages for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "canned messages admin delete" on public.canned_messages;
create policy "canned messages admin delete"
on public.canned_messages for delete
to authenticated
using (public.is_admin());

drop policy if exists "testimonials read approved" on public.testimonials;
create policy "testimonials read approved"
on public.testimonials for select
to authenticated
using (approved = true or public.is_manager_or_admin());

drop policy if exists "testimonials manager insert" on public.testimonials;
create policy "testimonials manager insert"
on public.testimonials for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "testimonials manager update" on public.testimonials;
create policy "testimonials manager update"
on public.testimonials for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "clients read by role" on public.clients;
create policy "clients read by role"
on public.clients for select
to authenticated
using (public.is_manager_or_admin() or assigned_to = auth.uid());

drop policy if exists "clients create by role" on public.clients;
create policy "clients create by role"
on public.clients for insert
to authenticated
with check (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'));

drop policy if exists "clients update by role" on public.clients;
create policy "clients update by role"
on public.clients for update
to authenticated
using (public.is_manager_or_admin() or assigned_to = auth.uid())
with check (public.is_manager_or_admin() or assigned_to = auth.uid());

drop policy if exists "contact details admin direct read" on public.contact_details;
create policy "contact details admin direct read"
on public.contact_details for select
to authenticated
using (public.is_admin());

drop policy if exists "contact details manager admin insert" on public.contact_details;
create policy "contact details manager admin insert"
on public.contact_details for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "contact details manager admin update" on public.contact_details;
create policy "contact details manager admin update"
on public.contact_details for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "companies read by client access" on public.companies;
create policy "companies read by client access"
on public.companies for select
to authenticated
using (public.can_access_client(owner_client_id));

drop policy if exists "companies insert manager admin" on public.companies;
create policy "companies insert manager admin"
on public.companies for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "companies update manager admin" on public.companies;
create policy "companies update manager admin"
on public.companies for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "quotes read by role" on public.quotes;
create policy "quotes read by role"
on public.quotes for select
to authenticated
using (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid());

drop policy if exists "quotes create by team" on public.quotes;
create policy "quotes create by team"
on public.quotes for insert
to authenticated
with check (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'));

drop policy if exists "quotes update by role" on public.quotes;
create policy "quotes update by role"
on public.quotes for update
to authenticated
using (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid())
with check (public.is_manager_or_admin() or assigned_to = auth.uid() or created_by = auth.uid());

drop policy if exists "quote services read by quote access" on public.quotes_services;
create policy "quote services read by quote access"
on public.quotes_services for select
to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_id
      and (public.is_manager_or_admin() or q.assigned_to = auth.uid() or q.created_by = auth.uid())
  )
);

drop policy if exists "quote services write team" on public.quotes_services;
create policy "quote services write team"
on public.quotes_services for all
to authenticated
using (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'))
with check (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'));

drop policy if exists "quote clauses read by quote access" on public.quotes_tc_clauses;
create policy "quote clauses read by quote access"
on public.quotes_tc_clauses for select
to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_id
      and (public.is_manager_or_admin() or q.assigned_to = auth.uid() or q.created_by = auth.uid())
  )
);

drop policy if exists "quote clauses write team" on public.quotes_tc_clauses;
create policy "quote clauses write team"
on public.quotes_tc_clauses for all
to authenticated
using (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'))
with check (public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office'));

drop policy if exists "compliance read by manager or assignment" on public.compliance_schedules;
create policy "compliance read by manager or assignment"
on public.compliance_schedules for select
to authenticated
using (public.is_manager_or_admin() or assigned_to = auth.uid());

drop policy if exists "compliance insert manager admin" on public.compliance_schedules;
create policy "compliance insert manager admin"
on public.compliance_schedules for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "compliance update manager admin" on public.compliance_schedules;
create policy "compliance update manager admin"
on public.compliance_schedules for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "activity log read by role" on public.activity_log;
create policy "activity log read by role"
on public.activity_log for select
to authenticated
using (public.is_manager_or_admin() or user_id = auth.uid());

drop policy if exists "activity log insert authenticated" on public.activity_log;
create policy "activity log insert authenticated"
on public.activity_log for insert
to authenticated
with check (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "settings admin" on public.app_settings;
create policy "settings admin"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "settings read team safe keys" on public.app_settings;
create policy "settings read team safe keys"
on public.app_settings for select
to authenticated
using (key in ('quote_footer'));

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

insert into public.states (name, surcharge, reason)
values
  ('Punjab', 10000, 'Higher stamp duty'),
  ('Madhya Pradesh', 10000, 'Higher stamp duty'),
  ('Karnataka', 10000, 'Higher stamp duty'),
  ('Kerala', 5000, 'Higher stamp duty'),
  ('Rajasthan', 5000, 'Higher stamp duty'),
  ('West Bengal', 0, null),
  ('Delhi', 0, null),
  ('Maharashtra', 0, null),
  ('Gujarat', 0, null),
  ('Tamil Nadu', 0, null)
on conflict (name) do update set surcharge = excluded.surcharge, reason = excluded.reason;

insert into public.services (
  code,
  name,
  category,
  pricing_mode,
  short_description,
  full_description,
  prepaid_fee,
  postpaid_fee,
  first_installment,
  first_trigger,
  second_trigger,
  timeline_typical,
  inclusions,
  not_included,
  required_documents,
  state_variations_apply,
  active
)
values
  ('INC-PVT-LTD', 'Private Limited Registration', 'Incorporation', 'fixed', 'Company incorporation with DSC, DIN, PAN, TAN and incorporation documents.', 'End-to-end support for Private Limited company incorporation.', 7999, 9999, 4999, 'After DSC is applied', 'After Incorporation Certificate is issued', '10-20 working days, subject to MCA processing', 'DSC application, DIN, name application, SPICe+ filing, PAN/TAN, MOA/AOA, incorporation certificate guidance', 'Government portal downtime, name rejection beyond included attempts, cash deposit charges, post-incorporation services not listed in the quote', 'PAN, Aadhaar, photograph, address proof, proposed names, registered office proof, landlord NOC if rented', true, true),
  ('INC-OPC', 'OPC Registration', 'Incorporation', 'fixed', 'One Person Company incorporation with statutory registrations and documents.', 'End-to-end support for One Person Company incorporation.', 7999, 9999, 4999, 'After DSC is applied', 'After Incorporation Certificate is issued', '10-20 working days, subject to MCA processing', 'DSC application, DIN, name application, SPICe+ filing, PAN/TAN, MOA/AOA, incorporation certificate guidance', 'Government portal downtime, name rejection beyond included attempts, cash deposit charges, post-incorporation services not listed in the quote', 'PAN, Aadhaar, photograph, address proof, proposed names, nominee details, registered office proof', true, true),
  ('INC-LLP', 'LLP Registration', 'Incorporation', 'fixed', 'LLP formation support with partner documentation and filing.', 'End-to-end support for LLP registration.', 0, 0, null, 'After DSC is applied', 'After LLP incorporation is issued', '10-20 working days, subject to MCA processing', 'DSC application, DPIN support, name application, incorporation filing, LLP agreement guidance', 'State stamp duty, name rejection beyond included attempts, cash deposit charges, services not listed in the quote', 'PAN, Aadhaar, photograph, address proof, proposed names, registered office proof, partner details', true, true),
  ('GST-REG', 'GST Registration', 'Taxation', 'fixed', 'GST registration filing and document support.', 'GST registration support for eligible businesses.', 2499, 3499, null, null, null, '3-7 working days, subject to department processing', 'GST application preparation, document checklist, filing support, follow-up guidance', 'Department clarification responses beyond normal scope, additional registrations, physical verification handling unless quoted', 'PAN, Aadhaar, business address proof, bank details, photograph, authorization letter if applicable', false, true),
  ('ROC-ANNUAL', 'Annual ROC Compliance', 'Compliance', 'engagement_based', 'Annual ROC filing support based on company profile.', 'Annual compliance filing and coordination for companies.', 0, 0, null, null, null, 'Depends on financial statements and company status', 'Annual filing coordination, checklist, forms preparation support, filing status updates', 'Audit, accounting, late fees, additional legal opinions unless included in the quote', 'Financial statements, board details, shareholding details, DSC, previous filings', false, true)
on conflict (code) do nothing;

insert into public.tc_clauses (name, client_facing_text, trigger_type, category, order_priority, active)
values
  ('Postpaid refund policy', 'Postpaid plan: there is no advance, so there is no refund question before work starts. The first payment becomes due only after DSC is applied.', 'always', 'refund', 10, true),
  ('Prepaid refund policy', 'Prepaid plan: 100% refund if we have not started work. Once work begins, refund is not possible because costs are paid to government or authorities in your name. That is our entire policy. No fine print.', 'always', 'refund', 20, true),
  ('Government portal reality', 'Government portals can fail or slow down. We will keep you informed if a portal issue affects the timeline.', 'always', 'timeline', 30, true),
  ('State surcharge clarity', 'Some states carry higher stamp duty. If your state has a surcharge, it is shown clearly in this quotation.', 'conditional', 'pricing', 40, true),
  ('Quote validity', 'This quotation is valid for 15 days. If government fees change after that, we will send an updated quote and explain what changed.', 'always', 'pricing', 50, true)
on conflict do nothing;

insert into public.document_categories (name, sort_order)
values
  ('Identity', 10),
  ('Office', 20),
  ('Business', 30),
  ('Incorporation', 40),
  ('Taxation', 50),
  ('Compliance', 60),
  ('General', 100)
on conflict (name) do nothing;

insert into public.document_templates (name, category, description)
values
  ('PAN Card', 'Identity', 'PAN card of applicant or authorised person.'),
  ('Aadhaar Card', 'Identity', 'Aadhaar card of applicant or authorised person.'),
  ('Passport-size Photograph', 'Identity', 'Recent photograph for application records.'),
  ('Address Proof', 'Identity', 'Electricity bill, bank statement, or similar valid address proof.'),
  ('Registered Office Proof', 'Office', 'Electricity bill or tax receipt for registered office address.'),
  ('Landlord NOC', 'Office', 'No-objection certificate when the premises are rented.'),
  ('Bank Details', 'Business', 'Cancelled cheque or bank details where required.'),
  ('Proposed Business Names', 'Incorporation', 'Preferred names in order of priority.')
on conflict (category, name) do nothing;

update public.document_templates dt
set category_id = dc.id
from public.document_categories dc
where dt.category_id is null
  and dc.name = coalesce(nullif(trim(dt.category), ''), 'General');

insert into public.canned_messages (title, category, body, use_case)
values
  (
    'Government portal reality',
    'Timeline',
    'Government portals can slow down or fail without notice. If that affects your timeline, we will tell you clearly and keep the next step simple.',
    'quote_note'
  ),
  (
    'Existing client note',
    'Relationship',
    'Good to hear from you again. I have kept this quote short and practical, based on what we already know about your work with us.',
    'quote_note'
  ),
  (
    'Documents can follow',
    'Documents',
    'You do not need to arrange every document before accepting the quote. We can start with the basic details and guide you on the remaining papers.',
    'quote_note'
  )
on conflict (category, title) do nothing;

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
