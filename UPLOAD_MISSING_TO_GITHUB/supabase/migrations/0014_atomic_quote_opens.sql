-- Atomic open-count increment for the email tracking pixel (Phase 5 — perf).
--
-- Why: the pixel route at app/track/pixel/[quoteId]/route.ts previously did
-- read-modify-write: SELECT open_count, then UPDATE open_count = N+1. Two
-- pixels fetched at the same instant both read N, both write N+1, and one
-- count is silently lost. With email automation that fires bulk sends, this
-- race is real, not theoretical.
--
-- This function does the read + increment + first_opened/last_opened bookkeeping
-- inside a single statement. The caller passes the quote id and the timestamp;
-- the timestamp parameter is intentional so the JS side can use new Date()
-- and not introduce server-clock vs DB-clock skew.

create or replace function public.increment_quote_opens(
  p_quote_id uuid,
  p_now timestamptz default now()
)
returns void
language sql
as $$
  update public.quotes
  set
    open_count = coalesce(open_count, 0) + 1,
    first_opened = coalesce(first_opened, p_now),
    last_opened = p_now,
    status = case when status = 'sent' then 'viewed' else status end
  where id = p_quote_id;
$$;

-- Note: this function runs with the caller's privileges. The pixel route uses
-- the service-role admin client, which bypasses RLS, so no security definer
-- wrapper is needed. If you ever expose this RPC to anon, switch to
-- `security definer` and add a check that the caller can see the quote.
