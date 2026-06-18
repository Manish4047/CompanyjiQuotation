create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_templates
  add column if not exists category_id uuid references public.document_categories(id) on delete set null;

drop trigger if exists document_categories_updated_at on public.document_categories;
create trigger document_categories_updated_at before update on public.document_categories for each row execute function public.set_updated_at();

alter table public.document_categories enable row level security;

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

insert into public.document_categories (name, sort_order)
select distinct coalesce(nullif(trim(category), ''), 'General') as name, 100
from public.document_templates
on conflict (name) do nothing;

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

update public.document_templates dt
set category_id = dc.id
from public.document_categories dc
where dt.category_id is null
  and dc.name = coalesce(nullif(trim(dt.category), ''), 'General');

create index if not exists document_templates_category_id_idx on public.document_templates(category_id);
