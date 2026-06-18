alter table public.campaigns
  add column if not exists whatsapp_template_key text,
  add column if not exists whatsapp_template_status text not null default 'draft',
  add column if not exists whatsapp_preview_text text;

alter table public.drip_steps
  add column if not exists whatsapp_template_key text,
  add column if not exists whatsapp_template_status text not null default 'draft',
  add column if not exists whatsapp_preview_text text;

alter table public.campaigns
  drop constraint if exists campaigns_whatsapp_template_status_check;

alter table public.campaigns
  add constraint campaigns_whatsapp_template_status_check
  check (whatsapp_template_status in ('draft', 'submitted', 'approved', 'rejected'));

alter table public.drip_steps
  drop constraint if exists drip_steps_whatsapp_template_status_check;

alter table public.drip_steps
  add constraint drip_steps_whatsapp_template_status_check
  check (whatsapp_template_status in ('draft', 'submitted', 'approved', 'rejected'));
