# Companyji CRM

Companyji CRM is a full-stack quotation and CRM web app for Companyji's team. It is designed for secure contact handling, fast quote creation, behavior-aware follow-up, and simple service catalog management.

## What This Build Contains Now

- Next.js App Router project with TypeScript strict mode.
- Supabase schema and Row Level Security foundation.
- Role model for Admin, Manager, Sales, Executive, and Shared-Office users.
- Lead management workspace with assignment, reminders, and notes.
- Unified lead intake routes for Meta lead ads, Google Forms, website forms, and unknown WhatsApp numbers.
- Google Sheets lead tracker sync for cold-calling, WhatsApp, and Meta lead tabs.
- WhatsApp inbox foundation using Meta Cloud API webhooks.
- Lead-to-quote handoff with quote prefill from the selected lead.
- Contact details stored separately from client records.
- Audit log table designed as an append-only trail.
- Service catalog and quote-builder foundation.
- Companyji brand theme using black, off-white, and `#a0ce4e`.
- Brevo-ready environment setup. Gmail can still be used manually or through a later provider adapter.

## Local Setup

1. Install Node.js 20.19 or newer. The app includes `.nvmrc` with the expected version.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and fill the Supabase keys.
4. Create a Supabase project.
5. Run the SQL migrations in `supabase/migrations/` in order, including `0015_leads_crm_v1.sql` and `0016_lead_intake_pipeline.sql`.
6. Start the app:

```bash
npm run dev
```

The app opens at `http://localhost:3000`.

## One-click launchers (Windows)

The repo includes three Windows batch files at the project root so non-developers can run the app without a terminal. Pin **Start Companyji.bat** to your taskbar or put a shortcut on the desktop.

- **Start Companyji.bat** — Launches the production server and opens the browser. First run installs deps and builds (≈3–5 min). Subsequent runs take ≈10–15 seconds. Keep the window open while using the app.
- **Rebuild Companyji.bat** — Use after pulling updated code. Reinstalls deps and rebuilds a fresh production bundle, then exits. Run **Start Companyji.bat** afterward.
- **Stop Companyji.bat** — Use only if the server window closed unexpectedly and you see "port 3000 already in use".

### Why production mode is dramatically faster

`npm run dev` recompiles every route the first time you visit it — that's why pages can take 15–30 seconds to open the first time and stay sluggish even after. The production build (`Start Companyji.bat`, or `npm run start:fresh`) precompiles everything once, so every page opens in well under a second. **Use dev mode only when actively editing code.**

## Supabase Setup Notes

Use Supabase Auth for login. Do not store passwords in the app database. After creating users in Supabase Auth, insert matching rows into `profiles` with the correct role and `active = true`.

For the first admin, create the Supabase Auth user, copy their user ID, then insert:

```sql
insert into public.profiles (id, email, full_name, role, active)
values ('AUTH_USER_ID_HERE', 'your@email.com', 'Your Name', 'admin', true);
```

## Lead CRM Deployment

The leads module, WhatsApp inbox setup, cron scheduler, and V2 production roadmap are documented in [LEADS_CRM_DEPLOYMENT.md](/D:/Codex/2026-04-21-https-claude-ai-share-3b8065a4-bf14/LEADS_CRM_DEPLOYMENT.md).

## Current Build Order

1. Foundation, auth, roles, RLS, layout.
2. User management.
3. Services CRUD.
4. T&C clauses.
5. Clients and secure contact reveal.
6. Quote builder.
7. Email sending and tracking.
8. Public quote view.
9. Drip automation.
10. Google Sheets sync.

## Important Security Principle

Contact details are not shown in list views. Non-admin reveal actions must go through a server-side action that logs the reveal immediately before returning the real contact value.
