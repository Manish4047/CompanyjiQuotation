alter table public.quotes
  add column if not exists company_name_snapshot text,
  add column if not exists client_mobile_snapshot text;
