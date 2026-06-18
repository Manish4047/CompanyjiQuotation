alter table public.services
  add column if not exists prepaid_description text not null default 'Full payment upfront. Work begins after payment confirms.',
  add column if not exists postpaid_description text not null default 'No advance. Payment is due after the agreed milestone.';

alter table public.quotes
  add column if not exists include_prepaid_plan boolean not null default true,
  add column if not exists include_postpaid_plan boolean not null default true,
  add column if not exists recommended_plan public.plan_choice not null default 'postpaid',
  add column if not exists document_items jsonb not null default '[]',
  add column if not exists canned_note_items jsonb not null default '[]',
  add column if not exists other_fee_items jsonb not null default '[]',
  add column if not exists other_fee_total integer not null default 0;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
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

drop trigger if exists document_templates_updated_at on public.document_templates;
create trigger document_templates_updated_at before update on public.document_templates for each row execute function public.set_updated_at();

drop trigger if exists canned_messages_updated_at on public.canned_messages;
create trigger canned_messages_updated_at before update on public.canned_messages for each row execute function public.set_updated_at();

alter table public.document_templates enable row level security;
alter table public.service_document_templates enable row level security;
alter table public.canned_messages enable row level security;

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
