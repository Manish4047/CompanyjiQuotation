# Companyji CRM Handoff

## Active project folder

`D:\Codex\2026-04-21-https-claude-ai-share-3b8065a4-bf14`

## Current app shape

- Next.js app
- Supabase for database/auth
- Brevo for email
- Quote builder, pipeline, campaigns, clients, services, documents, tracking, PDF quote flow

## Important local files

- `START_HERE.md`
- `README.md`
- `.env.local`
- `supabase/migrations/`

## Current status

- Multi-currency support is in place
- Quantity support is in place in quote builder
- Quantity basis can now be selected as:
  - `Units`
  - `Year`
  - `Nos`
- Quote preview / PDF / sent email use the selected basis wording
- Number input scroll-wheel accidental increments were disabled

## Recent deployment guidance

- Real working copy is on `D:` drive
- `C:` copy was effectively empty and should not be used for deployment
- Preferred hosting path discussed:
  - GitHub private repo
  - Cloudways app
  - PM2 for process
  - `.htaccess` reverse proxy

## Cloudways notes

- Upload/deploy the `D:` project, not the `C:` project
- Keep `.env.local` values aligned with live environment
- Production `APP_BASE_URL` should be the live domain, not localhost
- Supabase auth callback must match the live domain

## Files most recently touched for quote quantity / basis work

- `components/quotes/quote-builder.tsx`
- `components/quotes/quote-document-preview.tsx`
- `components/ui/field.tsx`
- `lib/pricing.ts`
- `lib/quotes/render.ts`
- `app/(app)/quotes/actions.ts`
- `app/globals.css`
- `tests/quote-render.test.ts`

## Verification state

- `npm run build` passed on the `D:` project
- `npm test` passed on the `D:` project
- `npm run typecheck` passed on the `D:` project

## When reopening from another machine

Tell Codex:

`Read START_HERE.md and CODEX_HANDOFF.md first, then continue working from there.`

## Immediate next likely tasks

- Cloudways deployment setup files
- GitHub private repo setup if not already done
- PM2 / `.htaccess` deployment polish
- final review of quote wording and production env settings
