# Companyji CRM — Redesign Plan (Phased)

Captured from Kunal's review on 21 May 2026. This builds on `REVIEW.md` (which already shipped P0 reliability fixes) and tackles the deeper UX, data-model, and performance items that were deferred.

The goal is to ship in small, verifiable phases so the working app never breaks.

---

## Phase 0 — Bug fixes (1 short session)

These are real defects, not redesigns. Do them first so the rest of the work happens on a clean base.

### 0.1 Quote "Superseded" is over-scoped
**Bug:** Creating any new quote for a client marks **every** other open quote for that client as `superseded`, regardless of which service it covers.

**Where:** `app/(app)/quotes/actions.ts`, around line 366–370 — the update runs `eq("client_id", clientId)` with no service filter.

**Fix:**
- Compare the new quote's service set to each existing open quote. Only supersede when the service set overlaps materially (or is a strict superset).
- Better still, make supersession explicit: add a "This replaces quote #…" picker to the new-quote form. If the user doesn't pick one, supersede nothing automatically.
- Repeating the same quote to the same client (re-send) should not flip the old one to superseded — only mark superseded when the **revision** is materially different.

### 0.2 Slow page opens on local install
**Symptom:** Even on localhost, pages feel sluggish.

**Suspects (in priority order):**
1. `findMatchingClientId` paginates up to 20,000 contact rows on every new-client create — `REVIEW.md #5`.
2. Pipeline loads 1000 quotes + a nested `email_events` query for every one of them (`/pipeline/page.tsx`, lines 156-228). For 200+ quotes this is dozens of round trips.
3. Dev mode in Next 16 + Turbopack rebuilds the route on every file save; check `next.config.mjs` for stale config.
4. `services/page.tsx` does 3 parallel queries with no pagination on `services` or `service_document_templates`.

**Fix this session:**
- Cap pipeline initial load to 100 rows + "Load more"; defer `email_events` to client-side after first paint.
- Drop the 20k contact scan: add `normalized_primary_email` + `normalized_primary_mobile` columns with unique partial indexes, query directly. (Schema migration `0014_normalized_contacts.sql`.)
- Audit `next.config.mjs` — confirm `experimental.optimizePackageImports`, remove anything we don't need, ensure Turbopack is on.

---

## Phase 1 — Services page redesign

### Pain
- Left "Add service" column is fixed at 420px — too narrow, fields wrap awkwardly, scrolling is constant.
- Required + optional fields are all jammed together: you can't add a service in under a minute even when you have one in your head.
- "Category" is a free-text input — typos make new categories that pollute the dropdown.
- Service cards are heavy: every card shows full pricing, currency, surcharge, add-on flag, doc count, timeline. No visual hierarchy.

### Redesign
**Top-level layout:** kill the two-column split. Service list is full-width. "Add service" becomes a right-side slide-over drawer triggered by a sticky `+ Add service` button.

**Quick Add (drawer, default tab):**
- Service name *
- Category (combobox: type-ahead over existing values, with `+ Create "Cat name"`)
- Pricing mode (fixed / engagement / retainership)
- One price field (whichever applies to the chosen mode)
- Save

That's it — under 30 seconds. Everything else gets sensible defaults.

**Advanced (drawer, second tab):**
- Currency, prepaid/postpaid split, retainership cycle, descriptions
- Inclusions / not-included / required documents (existing rich-text)
- Document templates checklist
- Government-fees / out-of-pocket / state-surcharge flags
- Internal notes

**List redesign:**
- Compact rows by default: name, category pill, price, status. Click expands inline for full detail (no `<details>` summary spam).
- Single-line search + category filter + status filter sticky at top.
- Bulk actions in a footer bar (activate, deactivate, delete) when rows are selected.

**Category management:**
- Inline `+ Add category` is the **only** way new categories get created — no free text.
- Categories are now a real table (`service_categories`) so renaming one updates all services atomically.

### Files
- `components/services/service-create-form.tsx` → split into `ServiceQuickAddDrawer` + `ServiceAdvancedFields`.
- `app/(app)/services/page.tsx` → full-width list, drawer trigger.
- New `components/ui/combobox.tsx` (typeahead + create).
- Migration `0015_service_categories.sql`.

---

## Phase 2 — Pipeline redesign (modern follow-up)

### Pain
- Pipeline is a compact 12-column table. Hard to scan.
- Follow-up date hides inside the expanded row even though it's the single most important field.
- Status is a `<select>` with all 11 values — no visual stage.
- Comment is treated like a permanent free-text box (Phase 3 fixes that).

### Redesign
**Two views, user-toggleable, remembered in URL:**
1. **Board view** (default) — Kanban columns grouped by status stage (Sent → Viewed → Negotiating → Accepted / Lost). Each card shows client name, amount, follow-up chip, top 3 tags. Drag a card between columns to update status.
2. **List view** — current table but cleaner: 6 columns max (Client, Quote, Status, Follow-up, Amount, Updated). Sort by any column. Filter row sticky.

**Follow-up chip (visible in both views):**
- Overdue → red, e.g. "Overdue · 3d"
- Today → amber, "Today"
- This week → green, "in 2d · Sat"
- Future → muted, "23 May"
- None → "Set follow-up" ghost button
- Click chip: popover with "+1d / +3d / +7d / Custom date / Clear".

**Status pills** colored properly (lib/utils.ts `quoteStatusTone` already exists — extend usage to all stages).

**Quick filters** as chips: My follow-ups today, Overdue, This week, Hot leads, By folder, By tag.

### Files
- `components/pipeline/pipeline-board.tsx` (new) — `@dnd-kit` (already installed).
- `components/pipeline/pipeline-list.tsx` (rename of current `pipeline-table.tsx`, trimmed).
- `components/pipeline/follow-up-chip.tsx` (new).
- `app/(app)/pipeline/page.tsx` — view toggle, sticky filter bar.

---

## Phase 3 — Comments: notepad → timeline

### Pain
- `quotes.pipeline_comment` is a single textarea. New text overwrites old. No author. No timestamp.

### Redesign
**Data model (migration `0016_quote_comments.sql`):**
```
quote_comments
  id           uuid pk
  quote_id     uuid fk → quotes
  author_id    uuid fk → profiles
  body         text
  created_at   timestamptz
  edited_at    timestamptz (null until edit)
  revision_of  uuid (null; points at the previous version on edit)
```

Edits create a new row, set `revision_of`. Original is preserved forever.

**UI:**
- In the pipeline row expand-panel and on the quote detail page, render a timeline (newest first): "Kunal · 21 May 2026 14:02 — Followed up on WhatsApp, asked for GST cert."
- Add-comment box at the top of the timeline.
- Hover any comment → Edit / Delete (delete is soft — kept for audit).
- Edits show a small "edited" badge with the old text behind a "view history" disclosure.

**Migration:** read existing `pipeline_comment` text into one `quote_comments` row per quote on first write (lazy), so nothing is lost.

### Files
- Migration `0016_quote_comments.sql`.
- New `components/comments/comment-thread.tsx`.
- Replace the textarea in `pipeline-table.tsx` and quote detail page.

---

## Phase 4 — Folder & Category management made easy

### Pain
- To add a folder/category/tag you must navigate to `/pipeline-setup`. Breaks flow.

### Redesign
- In the pipeline row, the Folder `<select>` becomes a combobox with "+ New folder" at the bottom. Admin-only.
- Same for tags (already partially controlled via `pipeline_tags`/`pipeline_tag_categories`).
- Same for service Category (Phase 1 already does this).
- `/pipeline-setup` stays for bulk management but is no longer required for the common case.

### Files
- `components/ui/combobox.tsx` (shared with Phase 1).
- New server actions `createFolderInline`, `createTagInline`, `createCategoryInline` with role gating.

---

## Phase 5 — Performance pass

After visible UX is solid, tighten the engine.

- `findMatchingClientId`: schema change — normalized email/mobile columns with unique indexes; replace 20k-row scan.
- Pipeline: server-side pagination + cursor; lazy-load email events per row when expanded.
- Email pixel race condition: `supabase.rpc("increment_quote_opens", { quote_id })` Postgres atomic.
- Dashboard, Activity, Documents: skeleton loading states.
- Bundle audit: heavy components (quote-builder ~1800 lines) → dynamic import.
- `formatCurrency`: use currency-aware locale lookup.

### Files
- Migrations `0017_normalized_contacts.sql`, `0018_atomic_quote_opens.sql`.
- Refactor `app/(app)/pipeline/page.tsx` to paginate.
- `lib/utils.ts` formatter rewrite.

---

## Decision needed from Kunal

Which phase do you want to start with? My recommendation is **Phase 0 first** (the supersede bug is silently corrupting your data right now), then **Phase 1** because services are the choke point for adding inventory, then Phase 2/3 in order. Phases 4 and 5 can land along the way.
