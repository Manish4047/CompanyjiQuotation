# Companyji CRM — Senior Review

Reviewed: app/, components/, lib/, middleware (Next 16 + React 19 + Supabase + Tailwind 4).
Scope: whole app, breadth-first. Findings are grouped by priority, with the file and the change applied (or recommended).

A "✅ applied in this pass" tag means the fix is included in this changeset. "↪ recommended" means it needs deeper rework or product input.

---

## P0 — Reliability, security, and broken UX

### 1. Mobile navigation only reaches the first 7 of 14 routes ✅ applied
`components/layout/app-shell.tsx` rendered `navItems.slice(0, 7)` in the mobile header. Settings, Activity, Campaigns, Documents, Services, Canned Messages, Pipeline Setup, and Compliance were unreachable on a phone — they show in the sidebar but the sidebar is `hidden lg:block`. Replaced with a `<details>` overflow menu containing the full nav list, and added an active-route highlight so users always know where they are.

### 2. `createQuoteDraft` throws raw errors instead of returning the user to the form ✅ applied
`app/(app)/quotes/actions.ts` had three `throw new Error(...)` paths for "no services selected", "no client selected", and "name too short". In a server action these surface as the Next.js error overlay (dev) or a generic 500 (prod) — the form state is lost. Wrapped the validation in a try/catch that redirects to `/quotes/new?error=...`, and added a hidden `redirect_path` so the same handler stays reusable. Same treatment for `sendQuoteEmailForQuote` callers and `updateClientIdentity`.

### 3. Middleware does an authenticated round-trip on every asset/route ✅ applied
`middleware.ts` matched everything except static assets, then ran `supabase.auth.getUser()` on every request — including the email-tracking pixel, marketing CSV export, and login page. Refined the matcher to skip `/api`, `/auth/callback`, `/track`, `/login`, `/forgot-password`, `/reset-password`. Auth still works because the protected layout (`app/(app)/layout.tsx`) calls `requireProfile()` and the public layouts call `getCurrentProfile()` directly.

### 4. No `error.tsx`, `loading.tsx`, or `not-found.tsx` for the app shell ✅ applied
Any thrown error in a server component (the `throw new Error` in `createQuoteDraft`, a Supabase outage, a missing column when a migration hasn't been run) currently boots the user to the default Next.js error page with no recovery path. Added a styled `app/(app)/error.tsx` and `app/(app)/loading.tsx`, plus a top-level `app/not-found.tsx`.

### 5. `findMatchingClientId` paginates 20k contact rows per quote ↪ recommended
`app/(app)/quotes/actions.ts` reads up to 20,000 `contact_details` rows on every new-client quote and filters in JS to find duplicates by email/mobile. At any real scale this is the slowest path in the app. Use a normalized lookup column (`normalized_primary_email`, `normalized_primary_mobile`) with a unique index, and query directly. Out of scope for this pass — schema change required.

### 6. Forgot-password leaks raw Supabase error text ✅ applied
`app/(auth)/forgot-password/actions.ts` did `redirect(?message=${error.message})`. Supabase auth errors are user-hostile ("AuthApiError: Email rate limit exceeded") and in some configs reveal whether an email exists. Switched to a single "If that email is in our system, the reset link is on its way." message regardless of outcome, and log the underlying error server-side via `console.error` for observability.

### 7. `QuoteShareTools.copyMessage` fails silently on permission denied / non-HTTPS ✅ applied
`components/quotes/quote-share-tools.tsx` awaited `navigator.clipboard.writeText` with no error handling. On Safari without HTTPS or in some embedded contexts this throws and the user sees nothing. Wrapped in try/catch with a fallback to `execCommand("copy")` and a visible "Couldn't copy — select the text manually" message.

### 8. Quote builder lets you submit with no services ✅ applied
Hidden inputs `service_ids` and `custom_service_items` could both be empty. Server action then throws (see #2). Added client-side disable on all four submit buttons when `serviceLines.length === 0 && customServices.length === 0`, plus a short hint above the buttons.

### 9. `client_mode = "existing"` + empty `existing_client_id` is accepted by the form, then crashes server-side ✅ applied
Same form, separate path. Submit buttons now also require an existing-client selection when in existing mode. Added an inline "Pick a client to continue" message.

---

## P1 — UX, validation, accessibility

### 10. Status pills on the quotes list don't use color for negative states ✅ applied
`app/(app)/quotes/page.tsx` rendered every status pill except `accepted` as `muted`. Lost, expired, spam, superseded all looked the same as draft. Added a small `quoteStatusTone` helper and used it everywhere a quote status pill renders (quotes list, quote detail header, pipeline table already had this — extracted to a shared util in `lib/utils.ts`).

### 11. Sidebar links don't indicate the current page ✅ applied
Server `AppShell` had no active state. Extracted the nav into a small client component that reads `usePathname()` and highlights the matching item. Also adds `aria-current="page"` for screen readers.

### 12. Auth error notices are not announced by screen readers ✅ applied
Login, forgot-password, and reset-password notices were plain `<div>` blocks. Gave them `role="status"` / `role="alert"` and `aria-live="polite"` / `"assertive"` so screen readers announce them.

### 13. Phone fields use `type="text"` instead of `type="tel"` ✅ applied
`primary_mobile`, `secondary_mobile`, and the footer phone inputs were plain text. On mobile this brings up the full QWERTY keyboard instead of the numeric pad. Switched to `type="tel"` with `inputMode="tel"`.

### 14. Email fields lack `inputMode="email"` ✅ applied
Same fix on quote-builder email inputs.

### 15. Compliance page hides overdue items ✅ applied
`app/(app)/compliance/page.tsx` filtered with `gte("due_date", today)`. The header copy promises "15-day, 7-day, 3-day, and overdue messages" but anything past due never appeared. Added an "Overdue" section above "Upcoming" pulled with `lt("due_date", today)` ordered most recent first.

### 16. Reset-password complexity requirement is hidden until you fail ✅ applied
Added a permanent "Use at least 8 characters" hint under the password field.

### 17. `QuoteShareTools` opens print page via `window.open` — pop-up blockers eat it ✅ applied
Replaced the `<Button onClick={() => window.open(...)}>` with a real `<a target="_blank" rel="noopener noreferrer">` styled as a button. Click events still work; pop-up blockers leave it alone.

### 18. No "no clients found" state in the quote builder client search ✅ applied
The existing-client search shows an empty list with no message when nothing matches. Added an inline empty state ("No clients match this search. Switch to New client to create one.").

### 19. Currency change silently wipes selected services ✅ applied
`changeQuoteCurrency` filters out services not in the new currency. Added a quick "Cleared N service(s) priced in <previous currency>" toast-style notice that appears below the currency field for ~5s.

### 20. Pipeline auto-save status is hidden in the expanded row ↪ recommended
`PipelineTable` saves every blur/change but only shows "Saving / Saved" inside the expanded notes panel. When the row isn't expanded the user gets no feedback. A small inline `Saving…/Saved/Error` badge in the row header would help. Skipping in this pass to avoid extending the already-long table; the audit doc and the existing per-row error message are sufficient until we redesign that view.

### 21. Pipeline category is a free-text datalist input ↪ recommended
Typos create new "categories" that never get cleaned up. Should be a controlled `<select>` with a separate "+ Add category" affordance gated to admins. Out of scope for this pass — needs product alignment with `pipeline_tags`/`tag_categories` which are already separately controlled.

### 22. Email-tracking pixel "open count" race ↪ recommended
`/track/pixel/[quoteId]` reads `open_count`, increments in JS, and writes back. Two near-simultaneous opens lose a count. A `supabase.rpc("increment_quote_opens", { quote_id })` (Postgres atomic) would fix it. Schema change — defer.

### 23. Quote list groups quotes only by created date ↪ recommended
For a register-style list this is fine. For UX, grouping by month with sticky headers would scale better when there are hundreds. Defer.

### 24. `Notice` is reimplemented in 6+ pages ✅ applied
Compliance, quotes, pipeline, settings, clients, services, documents, campaigns, pipeline-setup, canned-messages, quote-detail all redefine an identical `Notice` component. Extracted to `components/ui/notice.tsx` and replaced the inlined versions in the four highest-traffic pages (dashboard not affected, quotes, pipeline, clients, quote detail). Other pages still work — they have their own copies which I left in place to keep diff size bounded; follow-up cleanup is mechanical.

### 25. `RequireProfile` redirects always go to `/login` with no `next` ↪ recommended
A user who deep-links to `/quotes/abc123` while logged out lands on `/login` and then `/dashboard`, losing context. Pass `?next=/quotes/abc123` through `requireProfile` and have the login action honor it. Schema-safe but touches several spots — defer.

### 26. Dashboard "Recent quotes" doesn't filter by `created_by` ↪ recommended
Every user sees every quote in the workspace, even though the data model has `assigned_to` and `created_by`. Probably intentional for a small ops team but worth documenting and gating per role if you grow.

### 27. Activity log details column renders raw key/value or JSON when no priority key matches ↪ recommended
`detailSummary` falls back to `slice(0, 4)` of the `details` object. For events with deep nested details this displays as `[object Object]`. Minor.

---

## P2 — Polish

### 28. Hex literals everywhere instead of CSS vars ↪ recommended
`#a0ce4e`, `#6a912f`, `#fbfcf8`, `#e6ebdc`, `#b42318` are repeated dozens of times. Tailwind 4 has `--accent`, `--accent-dark`, etc. defined in `globals.css` but components don't use them. A theme refactor would replace these with `bg-[color:var(--accent)]` and friends.

### 29. Companies page is a static placeholder ↪ recommended
It's in the sidebar but does nothing. Either remove from nav until built, or add a "Module coming soon — link to dashboard" empty state with a CTA.

### 30. Quote builder is ~1800 lines in one file ↪ recommended
The component file is doing client form state + preview rendering + PDF-layout drafting + email/whatsapp brief building. Split into `<QuoteBuilderForm>`, `<QuoteBuilderPreview>`, `<QuoteBuilderServicePicker>`, etc. would make each piece testable. Defer to a planned refactor.

### 31. No skeleton or loading state on Supabase-heavy pages ✅ applied (partially)
Added `loading.tsx` for the `(app)` group as a generic shell skeleton; per-page skeletons (dashboard metric cards, pipeline rows) are still TBD.

### 32. `Card` has no semantic `<section>` / `<article>` element ↪ recommended
A small accessibility win — `Card` is a `<div>` everywhere. Could accept an `as` prop.

### 33. No keyboard skip-link ↪ recommended
Add a "Skip to main content" link in the layout so keyboard users don't tab through 14 nav items every page.

### 34. `formatCurrency` always formats in `en-IN` regardless of the currency code ↪ recommended
`formatCurrency(50, "USD")` renders as `US$50` not `$50` because of the `en-IN` locale. Adopt the locale-currency convention `en-IN` for INR, `en-US` for USD, etc., via a small lookup.

### 35. `maskMobile` and `maskEmail` assume a single shape ↪ recommended
`+1 (555) 555-5555` masks oddly because `mobile.slice(0,4)` includes the parenthesis. Strip to digits first, then format.

### 36. Sidebar shows the user's full name but not their email; long names overflow ↪ recommended
Add `truncate` + `title` for accessibility.

---

## Summary

The app's bones are solid — server actions and admin/anon Supabase clients are wired sensibly, RLS is honored, server-only is enforced where it should be. The most impactful fixes that ship in this pass are mobile navigation, the throwing-server-action fix, error-message hygiene, the missing error/loading/not-found boundaries, accessibility annotations, and the small "you can submit nothing and it explodes" guard rails in the quote builder. The deferred recommendations are flagged with ↪ above and form a clean follow-up list.
