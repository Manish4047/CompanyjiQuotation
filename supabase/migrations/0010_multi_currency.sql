alter table public.services
  add column if not exists currency_code text not null default 'INR';

alter table public.quotes
  add column if not exists currency_code text not null default 'INR';

update public.services
set currency_code = 'INR'
where currency_code is null or btrim(currency_code) = '';

update public.quotes
set currency_code = 'INR'
where currency_code is null or btrim(currency_code) = '';

alter table public.services
  drop constraint if exists services_currency_code_check;

alter table public.services
  add constraint services_currency_code_check
  check (currency_code in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'));

alter table public.quotes
  drop constraint if exists quotes_currency_code_check;

alter table public.quotes
  add constraint quotes_currency_code_check
  check (currency_code in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'));

create index if not exists services_currency_code_idx on public.services(currency_code);
create index if not exists quotes_currency_code_idx on public.quotes(currency_code);
