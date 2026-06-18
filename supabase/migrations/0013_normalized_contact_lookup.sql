-- Normalized contact lookup columns (Phase 5 — performance).
--
-- Before this migration, app/(app)/quotes/actions.ts called findMatchingClientId
-- which paginated up to 20,000 contact_details rows on every new-client quote
-- and filtered in JavaScript. At any real scale that's the single slowest path
-- in the app — both for the database (full sequential scan) and the network
-- (transferring tens of MB of contact rows).
--
-- Fix: store normalized lookup columns next to the originals and index them.
-- The app code keeps using lib/contacts.ts as the single source of truth for
-- normalization rules (so "+91-9876543210" and "9876543210" still match the
-- same row); the trigger below mirrors that JS logic in plain SQL.
--
-- Idempotent — safe to re-run.

alter table public.contact_details
  add column if not exists normalized_primary_email text,
  add column if not exists normalized_secondary_email text,
  add column if not exists normalized_primary_mobile text,
  add column if not exists normalized_secondary_mobile text,
  add column if not exists normalized_whatsapp_number text;

-- ---- Normalization helpers ------------------------------------------------
-- Email: trim + lowercase. Mirrors normalizeEmail() in lib/contacts.ts.
create or replace function public.normalize_contact_email(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null then null
    else nullif(lower(btrim(value)), '')
  end;
$$;

-- Mobile: digits-only, strip Indian country/trunk prefixes, last 10 digits.
-- Mirrors normalizeMobile() in lib/contacts.ts. We deliberately keep the
-- algorithm short and readable rather than perfectly idiomatic — the JS side
-- must stay in sync.
create or replace function public.normalize_contact_mobile(value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if value is null then return null; end if;
  digits := regexp_replace(value, '\D', '', 'g');
  if length(digits) = 0 then return null; end if;
  if length(digits) = 12 and substr(digits, 1, 2) = '91' then
    return substr(digits, 3);
  end if;
  if length(digits) = 11 and substr(digits, 1, 1) = '0' then
    return substr(digits, 2);
  end if;
  if length(digits) > 10 then
    return substr(digits, length(digits) - 9);
  end if;
  return digits;
end;
$$;

-- ---- Trigger: keep normalized columns in sync -----------------------------
create or replace function public.set_normalized_contact_fields()
returns trigger
language plpgsql
as $$
begin
  new.normalized_primary_email := public.normalize_contact_email(new.primary_email);
  new.normalized_secondary_email := public.normalize_contact_email(new.secondary_email);
  new.normalized_primary_mobile := public.normalize_contact_mobile(new.primary_mobile);
  new.normalized_secondary_mobile := public.normalize_contact_mobile(new.secondary_mobile);
  new.normalized_whatsapp_number := public.normalize_contact_mobile(new.whatsapp_number);
  return new;
end;
$$;

drop trigger if exists contact_details_normalize on public.contact_details;
create trigger contact_details_normalize
before insert or update of primary_email, secondary_email, primary_mobile, secondary_mobile, whatsapp_number
on public.contact_details
for each row execute function public.set_normalized_contact_fields();

-- ---- Backfill -------------------------------------------------------------
-- Cheap on small tables, expensive only if you already have hundreds of
-- thousands of rows. Run during a quiet window if that applies.
update public.contact_details set
  normalized_primary_email = public.normalize_contact_email(primary_email),
  normalized_secondary_email = public.normalize_contact_email(secondary_email),
  normalized_primary_mobile = public.normalize_contact_mobile(primary_mobile),
  normalized_secondary_mobile = public.normalize_contact_mobile(secondary_mobile),
  normalized_whatsapp_number = public.normalize_contact_mobile(whatsapp_number)
where normalized_primary_email is null
   and normalized_primary_mobile is null
   and (primary_email is not null or primary_mobile is not null);

-- ---- Indexes --------------------------------------------------------------
-- Partial: only index rows where the column is set, since most contacts have
-- only one channel (email-only or mobile-only). Non-unique because the same
-- email/mobile can appear across clients (e.g. shared family contact info)
-- — the app handles disambiguation. If you want strict uniqueness, replace
-- with `create unique index` and add a NULLS NOT DISTINCT clause.
create index if not exists contact_details_normalized_primary_email_idx
  on public.contact_details(normalized_primary_email)
  where normalized_primary_email is not null;

create index if not exists contact_details_normalized_secondary_email_idx
  on public.contact_details(normalized_secondary_email)
  where normalized_secondary_email is not null;

create index if not exists contact_details_normalized_primary_mobile_idx
  on public.contact_details(normalized_primary_mobile)
  where normalized_primary_mobile is not null;

create index if not exists contact_details_normalized_secondary_mobile_idx
  on public.contact_details(normalized_secondary_mobile)
  where normalized_secondary_mobile is not null;

create index if not exists contact_details_normalized_whatsapp_number_idx
  on public.contact_details(normalized_whatsapp_number)
  where normalized_whatsapp_number is not null;
