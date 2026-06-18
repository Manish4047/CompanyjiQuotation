do $$ begin
  create type public.lead_status as enum ('new', 'follow_up', 'qualified', 'quotation_sent', 'nurture', 'converted', 'lost');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_reminder_status as enum ('pending', 'done', 'dismissed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.whatsapp_message_direction as enum ('inbound', 'outbound', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.whatsapp_message_status as enum ('pending', 'sent', 'delivered', 'read', 'failed', 'received');
exception when duplicate_object then null;
end $$;

create or replace function public.normalize_phone(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null then ''
    else
      case
        when length(regexp_replace(value, '\D', '', 'g')) = 12 and regexp_replace(value, '\D', '', 'g') like '91%' then right(regexp_replace(value, '\D', '', 'g'), 10)
        when length(regexp_replace(value, '\D', '', 'g')) = 11 and regexp_replace(value, '\D', '', 'g') like '0%' then right(regexp_replace(value, '\D', '', 'g'), 10)
        when length(regexp_replace(value, '\D', '', 'g')) > 10 then right(regexp_replace(value, '\D', '', 'g'), 10)
        else regexp_replace(value, '\D', '', 'g')
      end
  end
$$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null unique,
  company_name text not null,
  contact_name text,
  director_name text,
  cin text,
  email text,
  phone text not null,
  normalized_phone text generated always as (public.normalize_phone(phone)) stored,
  alternate_phone text,
  normalized_alternate_phone text generated always as (public.normalize_phone(alternate_phone)) stored,
  whatsapp_number text,
  normalized_whatsapp_number text generated always as (
    public.normalize_phone(coalesce(nullif(whatsapp_number, ''), nullif(phone, '')))
  ) stored,
  source text not null default 'manual',
  status public.lead_status not null default 'new',
  quality smallint not null default 3 check (quality between 1 and 5),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  next_follow_up_at timestamptz,
  next_follow_up_note text,
  last_contacted_at timestamptz,
  converted_at timestamptz,
  lost_at timestamptz,
  tags text[] not null default '{}',
  compliance_notes text,
  remarks text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  due_at timestamptz not null,
  note text,
  status public.lead_reminder_status not null default 'pending',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  wa_id text,
  contact_name text,
  phone text,
  normalized_phone text generated always as (public.normalize_phone(phone)) stored,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  direction public.whatsapp_message_direction not null,
  message_status public.whatsapp_message_status not null default 'pending',
  message_type text not null default 'text',
  body text not null default '',
  media_url text,
  provider_message_id text,
  error_text text,
  payload jsonb not null default '{}'::jsonb,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  object_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status, created_at desc);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to, status);
create index if not exists leads_follow_up_idx on public.leads(next_follow_up_at);
create index if not exists leads_normalized_phone_idx on public.leads(normalized_phone);
create index if not exists leads_normalized_whatsapp_idx on public.leads(normalized_whatsapp_number);
create index if not exists lead_comments_lead_id_idx on public.lead_comments(lead_id, created_at desc);
create index if not exists lead_reminders_due_idx on public.lead_reminders(status, due_at);
create index if not exists lead_reminders_assigned_idx on public.lead_reminders(assigned_to, status, due_at);
create index if not exists whatsapp_conversations_last_message_idx on public.whatsapp_conversations(last_message_at desc nulls last);
create unique index if not exists whatsapp_conversations_wa_id_idx on public.whatsapp_conversations(wa_id) where wa_id is not null;
create unique index if not exists whatsapp_messages_provider_message_id_idx on public.whatsapp_messages(provider_message_id) where provider_message_id is not null;
create index if not exists whatsapp_messages_conversation_id_idx on public.whatsapp_messages(conversation_id, created_at);

create or replace function public.generate_lead_code()
returns trigger
language plpgsql
as $$
begin
  if new.lead_code is null or new.lead_code = '' then
    new.lead_code = 'L-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

create or replace function public.can_access_lead(target_lead_id uuid)
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
      from public.leads l
      where l.id = target_lead_id
        and (
          l.assigned_to = auth.uid()
          or l.created_by = auth.uid()
        )
    )
$$;

create or replace function public.can_access_whatsapp_conversation(target_conversation_id uuid)
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
      from public.whatsapp_conversations c
      where c.id = target_conversation_id
        and (
          c.assigned_to = auth.uid()
          or c.created_by = auth.uid()
          or (c.lead_id is not null and public.can_access_lead(c.lead_id))
        )
    )
$$;

create or replace function public.touch_whatsapp_conversation_from_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.whatsapp_conversations
  set
    lead_id = coalesce(new.lead_id, lead_id),
    last_message_preview = case
      when nullif(trim(new.body), '') is not null then left(trim(new.body), 180)
      else initcap(new.message_type) || ' message'
    end,
    last_message_at = new.created_at,
    unread_count = case
      when new.direction = 'inbound' then unread_count + 1
      when new.direction = 'outbound' then 0
      else unread_count
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads for each row execute function public.set_updated_at();

drop trigger if exists leads_generate_code on public.leads;
create trigger leads_generate_code before insert on public.leads for each row execute function public.generate_lead_code();

drop trigger if exists lead_reminders_updated_at on public.lead_reminders;
create trigger lead_reminders_updated_at before update on public.lead_reminders for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_updated_at before update on public.whatsapp_conversations for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_messages_touch_conversation on public.whatsapp_messages;
create trigger whatsapp_messages_touch_conversation
after insert on public.whatsapp_messages
for each row execute function public.touch_whatsapp_conversation_from_message();

alter table public.leads enable row level security;
alter table public.lead_comments enable row level security;
alter table public.lead_reminders enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

drop policy if exists "leads read by role or assignment" on public.leads;
create policy "leads read by role or assignment"
on public.leads for select
to authenticated
using (public.can_access_lead(id));

drop policy if exists "leads insert team" on public.leads;
create policy "leads insert team"
on public.leads for insert
to authenticated
with check (
  public.current_role() in ('admin', 'manager', 'sales', 'executive', 'shared_office')
  and (created_by = auth.uid() or public.is_manager_or_admin())
  and (
    assigned_to is null
    or assigned_to = auth.uid()
    or public.is_manager_or_admin()
  )
);

drop policy if exists "leads update by role or assignment" on public.leads;
create policy "leads update by role or assignment"
on public.leads for update
to authenticated
using (public.can_access_lead(id))
with check (
  public.is_manager_or_admin()
  or assigned_to = auth.uid()
  or (created_by = auth.uid() and assigned_to is null)
);

drop policy if exists "leads delete managers" on public.leads;
create policy "leads delete managers"
on public.leads for delete
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "lead comments read by lead access" on public.lead_comments;
create policy "lead comments read by lead access"
on public.lead_comments for select
to authenticated
using (public.can_access_lead(lead_id));

drop policy if exists "lead comments insert by lead access" on public.lead_comments;
create policy "lead comments insert by lead access"
on public.lead_comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_access_lead(lead_id)
);

drop policy if exists "lead comments delete managers" on public.lead_comments;
create policy "lead comments delete managers"
on public.lead_comments for delete
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "lead reminders read by lead access" on public.lead_reminders;
create policy "lead reminders read by lead access"
on public.lead_reminders for select
to authenticated
using (public.can_access_lead(lead_id));

drop policy if exists "lead reminders insert by lead access" on public.lead_reminders;
create policy "lead reminders insert by lead access"
on public.lead_reminders for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_lead(lead_id)
  and (
    assigned_to is null
    or assigned_to = auth.uid()
    or public.is_manager_or_admin()
  )
);

drop policy if exists "lead reminders update by lead access" on public.lead_reminders;
create policy "lead reminders update by lead access"
on public.lead_reminders for update
to authenticated
using (public.can_access_lead(lead_id))
with check (
  public.is_manager_or_admin()
  or assigned_to = auth.uid()
  or (assigned_to is null and created_by = auth.uid())
);

drop policy if exists "whatsapp conversations read by role or lead access" on public.whatsapp_conversations;
create policy "whatsapp conversations read by role or lead access"
on public.whatsapp_conversations for select
to authenticated
using (public.can_access_whatsapp_conversation(id));

drop policy if exists "whatsapp conversations write managers" on public.whatsapp_conversations;
create policy "whatsapp conversations write managers"
on public.whatsapp_conversations for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "whatsapp messages read by conversation access" on public.whatsapp_messages;
create policy "whatsapp messages read by conversation access"
on public.whatsapp_messages for select
to authenticated
using (public.can_access_whatsapp_conversation(conversation_id));

drop policy if exists "whatsapp messages write managers" on public.whatsapp_messages;
create policy "whatsapp messages write managers"
on public.whatsapp_messages for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists "whatsapp webhook events admin only" on public.whatsapp_webhook_events;
create policy "whatsapp webhook events admin only"
on public.whatsapp_webhook_events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
