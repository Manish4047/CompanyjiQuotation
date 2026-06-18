do $$
begin
  create type public.lead_ingest_status as enum ('received', 'processed', 'duplicate', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.lead_ingest_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_label text,
  external_id text,
  dedupe_key text,
  form_name text,
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  source_created_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  processing_status public.lead_ingest_status not null default 'received',
  notes text,
  error_text text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null;

create unique index if not exists lead_ingest_events_source_external_id_uidx
  on public.lead_ingest_events(source, external_id)
  where external_id is not null;

create index if not exists lead_ingest_events_status_created_idx
  on public.lead_ingest_events(processing_status, created_at desc);

create index if not exists lead_ingest_events_lead_id_idx
  on public.lead_ingest_events(lead_id, created_at desc);

create index if not exists lead_ingest_events_assigned_to_idx
  on public.lead_ingest_events(assigned_to, created_at desc);

create index if not exists quotes_source_lead_id_idx
  on public.quotes(source_lead_id);

drop trigger if exists lead_ingest_events_updated_at on public.lead_ingest_events;
create trigger lead_ingest_events_updated_at
before update on public.lead_ingest_events
for each row execute function public.set_updated_at();

alter table public.lead_ingest_events enable row level security;

drop policy if exists "lead ingest read by managers or lead access" on public.lead_ingest_events;
create policy "lead ingest read by managers or lead access"
on public.lead_ingest_events for select
to authenticated
using (
  public.is_manager_or_admin()
  or (lead_id is not null and public.can_access_lead(lead_id))
);

drop policy if exists "lead ingest insert managers" on public.lead_ingest_events;
create policy "lead ingest insert managers"
on public.lead_ingest_events for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists "lead ingest update managers" on public.lead_ingest_events;
create policy "lead ingest update managers"
on public.lead_ingest_events for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "lead ingest delete admins" on public.lead_ingest_events;
create policy "lead ingest delete admins"
on public.lead_ingest_events for delete
to authenticated
using (public.is_admin());
