-- Quote comments: real timeline of working notes on a quote / lead.
--
-- Replaces the single-textarea pipeline_comment column with an append-only
-- thread of authored, timestamped notes. We keep pipeline_comment around as a
-- legacy field (lazy-migrated by the UI on first new comment) so this change
-- is backwards-compatible — running this migration does not delete any data.
--
-- Design notes:
--   * Edits create a new row that points at the previous version through
--     revision_of. The original is preserved forever. This gives us a free
--     audit trail without a separate history table.
--   * Soft delete via deleted_at so the timeline can keep the slot but show a
--     placeholder ("comment removed"). Hard delete is left to admins.
--   * RLS mirrors the quotes table — anyone allowed to read a quote can read
--     its comments. Insert/update is gated to manager-or-admin to keep the
--     audit trail tight; sales agents can still write but the existing roles
--     plumbing treats them as managers for this purpose. Adjust below if the
--     policy needs to be tighter.

create table if not exists public.quote_comments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- revision_of points at the previous version of this comment. When a user
  -- edits a comment, we insert a NEW row and set revision_of = old.id, then
  -- mark the OLD row's edited_at so the timeline can hide superseded rows by
  -- default but still expose them via "view history".
  revision_of uuid references public.quote_comments(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create index if not exists quote_comments_quote_id_idx on public.quote_comments(quote_id);
create index if not exists quote_comments_author_id_idx on public.quote_comments(author_id);
create index if not exists quote_comments_created_at_idx on public.quote_comments(created_at desc);
-- Partial index for "latest revision of each comment chain" lookups — the
-- common UI query is "show every comment that hasn't been superseded".
create index if not exists quote_comments_active_idx
  on public.quote_comments(quote_id, created_at desc)
  where deleted_at is null and edited_at is null;

alter table public.quote_comments enable row level security;

drop policy if exists "quote comments read managers" on public.quote_comments;
create policy "quote comments read managers"
on public.quote_comments for select
to authenticated
using (public.is_manager_or_admin());

drop policy if exists "quote comments insert managers" on public.quote_comments;
create policy "quote comments insert managers"
on public.quote_comments for insert
to authenticated
with check (public.is_manager_or_admin() and author_id = auth.uid());

drop policy if exists "quote comments update managers" on public.quote_comments;
create policy "quote comments update managers"
on public.quote_comments for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

-- We intentionally don't expose DELETE through RLS — soft-delete via update
-- of deleted_at / deleted_by is the supported path. If you ever need to hard
-- delete (GDPR / right to erasure) do it through the service-role key.
