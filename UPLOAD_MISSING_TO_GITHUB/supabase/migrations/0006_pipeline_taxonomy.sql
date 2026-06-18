create table if not exists public.quote_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_tag_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_id uuid references public.pipeline_tag_categories(id) on delete set null,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes
  add column if not exists folder_id uuid;

do $$
begin
  alter table public.quotes
    add constraint quotes_folder_id_fkey
    foreign key (folder_id)
    references public.quote_folders(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists quotes_folder_id_idx on public.quotes(folder_id);
create index if not exists pipeline_tags_category_id_idx on public.pipeline_tags(category_id);

drop trigger if exists quote_folders_updated_at on public.quote_folders;
create trigger quote_folders_updated_at before update on public.quote_folders for each row execute function public.set_updated_at();

drop trigger if exists pipeline_tag_categories_updated_at on public.pipeline_tag_categories;
create trigger pipeline_tag_categories_updated_at before update on public.pipeline_tag_categories for each row execute function public.set_updated_at();

drop trigger if exists pipeline_tags_updated_at on public.pipeline_tags;
create trigger pipeline_tags_updated_at before update on public.pipeline_tags for each row execute function public.set_updated_at();

alter table public.quote_folders enable row level security;
alter table public.pipeline_tag_categories enable row level security;
alter table public.pipeline_tags enable row level security;

drop policy if exists "quote folders read authenticated" on public.quote_folders;
create policy "quote folders read authenticated"
on public.quote_folders for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "quote folders write managers" on public.quote_folders;
create policy "quote folders write managers"
on public.quote_folders for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "pipeline tag categories read authenticated" on public.pipeline_tag_categories;
create policy "pipeline tag categories read authenticated"
on public.pipeline_tag_categories for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "pipeline tag categories write managers" on public.pipeline_tag_categories;
create policy "pipeline tag categories write managers"
on public.pipeline_tag_categories for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "pipeline tags read authenticated" on public.pipeline_tags;
create policy "pipeline tags read authenticated"
on public.pipeline_tags for select
to authenticated
using (active = true or public.is_manager_or_admin());

drop policy if exists "pipeline tags write managers" on public.pipeline_tags;
create policy "pipeline tags write managers"
on public.pipeline_tags for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

insert into public.quote_folders (name, description, sort_order, active)
values
  ('Active', 'Current working leads and open quotations.', 10, true),
  ('Hold', 'Leads to revisit later without losing them.', 20, true),
  ('Archive', 'Old, won, lost, or parked leads kept out of the active working list.', 90, true)
on conflict (name) do update
set description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active;

insert into public.pipeline_tag_categories (name, description, sort_order, active)
values
  ('Temperature', 'Lead warmth and urgency.', 10, true),
  ('Source', 'Where the lead came from or how to treat it.', 20, true),
  ('Follow-up', 'Operational tags for next-step handling.', 30, true)
on conflict (name) do update
set description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active;

insert into public.pipeline_tags (name, category_id, description, sort_order, active)
select seed.name, category.id, seed.description, seed.sort_order, true
from (
  values
    ('Hot', 'Temperature', 'High-intent lead that needs fast follow-up.', 10),
    ('Warm', 'Temperature', 'Interested lead that still needs nurturing.', 20),
    ('Cold', 'Temperature', 'Low-intent lead or one to revisit later.', 30),
    ('Referral', 'Source', 'Lead came from a referral.', 10),
    ('Existing Client', 'Source', 'Lead belongs to an existing relationship.', 20),
    ('Website', 'Source', 'Lead came through a web form or website source.', 30),
    ('Docs Pending', 'Follow-up', 'Waiting for documents from the client.', 10),
    ('Awaiting Reply', 'Follow-up', 'Follow-up sent, waiting for response.', 20),
    ('Call Back', 'Follow-up', 'Needs a direct call rather than another message.', 30)
) as seed(name, category_name, description, sort_order)
join public.pipeline_tag_categories category
  on category.name = seed.category_name
on conflict (name) do update
set category_id = excluded.category_id,
    description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active;

update public.quotes
set folder_id = folders.id
from public.quote_folders folders
where public.quotes.folder_id is null
  and folders.name = 'Active';
