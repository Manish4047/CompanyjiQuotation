alter type public.pricing_mode add value if not exists 'retainership';

alter table public.services
  add column if not exists retainership_fee integer not null default 0,
  add column if not exists retainership_cycle text not null default 'monthly';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_retainership_cycle_check'
  ) then
    alter table public.services
      add constraint services_retainership_cycle_check
      check (retainership_cycle in ('monthly', 'quarterly', 'yearly'));
  end if;
end $$;

update public.services
set retainership_cycle = 'monthly'
where coalesce(trim(retainership_cycle), '') = '';
