alter table public.quotes
  add column if not exists pipeline_category text not null default 'General',
  add column if not exists followup_date date,
  add column if not exists pipeline_comment text not null default '';

create index if not exists quotes_pipeline_category_idx on public.quotes(pipeline_category);
create index if not exists quotes_followup_date_idx on public.quotes(followup_date);

create table if not exists public.marketing_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  list_type text not null check (list_type in ('manual', 'dynamic')),
  filters jsonb not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_list_members (
  list_id uuid not null references public.marketing_lists(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (list_id, client_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  list_id uuid references public.marketing_lists(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'both')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  subject text,
  message text not null default '',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists marketing_lists_updated_at on public.marketing_lists;
create trigger marketing_lists_updated_at before update on public.marketing_lists for each row execute function public.set_updated_at();

drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();

alter table public.marketing_lists enable row level security;
alter table public.marketing_list_members enable row level security;
alter table public.campaigns enable row level security;

drop policy if exists "marketing lists read managers" on public.marketing_lists;
create policy "marketing lists read managers"
on public.marketing_lists for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "marketing lists write managers" on public.marketing_lists;
create policy "marketing lists write managers"
on public.marketing_lists for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "marketing members read managers" on public.marketing_list_members;
create policy "marketing members read managers"
on public.marketing_list_members for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "marketing members write managers" on public.marketing_list_members;
create policy "marketing members write managers"
on public.marketing_list_members for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "campaigns read managers" on public.campaigns;
create policy "campaigns read managers"
on public.campaigns for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "campaigns write managers" on public.campaigns;
create policy "campaigns write managers"
on public.campaigns for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());
