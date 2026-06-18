create table if not exists public.drip_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null check (campaign_type in ('service_based', 'custom', 'one_time', 'reengagement')),
  trigger_type text not null check (trigger_type in ('quote_sent', 'quote_viewed_no_reply', 'inactive_quote', 'manual')),
  channel text not null check (channel in ('email', 'whatsapp', 'both')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved', 'needs_review')),
  description text not null default '',
  template_category text not null default 'Quotation follow-up',
  service_ids uuid[] not null default '{}',
  require_all_services boolean not null default false,
  min_quote_amount integer,
  max_quote_amount integer,
  inactivity_days integer,
  stop_on_reply boolean not null default true,
  stop_on_convert boolean not null default true,
  stop_on_not_interested boolean not null default true,
  pause_hours_after_reply integer not null default 72,
  frequency_cap_days integer not null default 5,
  dnd_respect boolean not null default true,
  version_no integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drip_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  step_order integer not null,
  delay_amount integer not null default 0,
  delay_unit text not null check (delay_unit in ('hours', 'days')),
  channel text not null check (channel in ('email', 'whatsapp', 'both')),
  subject text,
  message text not null default '',
  active boolean not null default true,
  template_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, step_order)
);

create table if not exists public.drip_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source text not null default 'automatic' check (source in ('automatic', 'manual', 'reengagement', 'list')),
  channel text not null check (channel in ('email', 'whatsapp', 'both')),
  status text not null default 'active' check (status in ('active', 'paused', 'stopped', 'completed')),
  trigger_snapshot jsonb not null default '{}'::jsonb,
  current_step integer not null default 0,
  next_step_at timestamptz,
  enrolled_at timestamptz not null default now(),
  last_step_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists drip_enrollments_unique_active_quote_idx
on public.drip_enrollments(campaign_id, quote_id)
where quote_id is not null and status in ('active', 'paused');

create table if not exists public.drip_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.drip_enrollments(id) on delete cascade,
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  step_id uuid references public.drip_steps(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'both')),
  event_type text not null check (event_type in ('scheduled', 'sent', 'opened', 'clicked', 'replied', 'failed', 'skipped', 'stopped')),
  provider text,
  recipient text,
  subject text,
  message_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.reply_suppressions (
  client_id uuid primary key references public.clients(id) on delete cascade,
  last_reply_at timestamptz,
  pause_until timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);

drop trigger if exists drip_campaigns_updated_at on public.drip_campaigns;
create trigger drip_campaigns_updated_at before update on public.drip_campaigns for each row execute function public.set_updated_at();

drop trigger if exists drip_steps_updated_at on public.drip_steps;
create trigger drip_steps_updated_at before update on public.drip_steps for each row execute function public.set_updated_at();

drop trigger if exists drip_enrollments_updated_at on public.drip_enrollments;
create trigger drip_enrollments_updated_at before update on public.drip_enrollments for each row execute function public.set_updated_at();

alter table public.drip_campaigns enable row level security;
alter table public.drip_steps enable row level security;
alter table public.drip_enrollments enable row level security;
alter table public.drip_events enable row level security;
alter table public.reply_suppressions enable row level security;

drop policy if exists "drip campaigns read managers" on public.drip_campaigns;
create policy "drip campaigns read managers"
on public.drip_campaigns for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "drip campaigns write managers" on public.drip_campaigns;
create policy "drip campaigns write managers"
on public.drip_campaigns for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "drip steps read managers" on public.drip_steps;
create policy "drip steps read managers"
on public.drip_steps for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "drip steps write managers" on public.drip_steps;
create policy "drip steps write managers"
on public.drip_steps for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "drip enrollments read managers" on public.drip_enrollments;
create policy "drip enrollments read managers"
on public.drip_enrollments for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "drip enrollments write managers" on public.drip_enrollments;
create policy "drip enrollments write managers"
on public.drip_enrollments for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "drip events read managers" on public.drip_events;
create policy "drip events read managers"
on public.drip_events for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "drip events write managers" on public.drip_events;
create policy "drip events write managers"
on public.drip_events for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "reply suppressions read managers" on public.reply_suppressions;
create policy "reply suppressions read managers"
on public.reply_suppressions for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "reply suppressions write managers" on public.reply_suppressions;
create policy "reply suppressions write managers"
on public.reply_suppressions for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create index if not exists drip_campaigns_status_idx on public.drip_campaigns(status);
create index if not exists drip_campaigns_service_ids_idx on public.drip_campaigns using gin(service_ids);
create index if not exists drip_steps_campaign_order_idx on public.drip_steps(campaign_id, step_order);
create index if not exists drip_enrollments_status_idx on public.drip_enrollments(status);
create index if not exists drip_enrollments_next_step_idx on public.drip_enrollments(next_step_at);
create index if not exists drip_events_campaign_occurred_idx on public.drip_events(campaign_id, occurred_at desc);
