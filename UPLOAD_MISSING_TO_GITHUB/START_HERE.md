# Companyji CRM - Start Here

This folder now contains the real web app foundation. The old basic prototype has been replaced.

## What Is Ready

- A Next.js full-stack app structure.
- Supabase database migration with roles, services, clients, contacts, quotes, compliance, and activity log.
- Login screen for email/password and Google login.
- Internal CRM layout for desktop and mobile.
- Dashboard.
- Services catalog with Admin-only create/toggle controls.
- Services can now be edited, deleted when unused, or deactivated when already used.
- New Quote screen with new/existing client mode.
- Quote preview shows both Prepaid and Postpaid, following the shared Companyji quotation format.
- Each service can now store its own Prepaid and Postpaid description.
- Quote creator can show both plans, hide either plan, and mark Prepaid or Postpaid as recommended.
- Quote preview text is editable inside fixed sections, so users cannot break the format.
- Quote preview includes Professional Fees, What is included, Refund Policy, What we need from you, Who we are, and footer sections.
- State variation and every add-on show as separate rows.
- Other fees and adjustments can be added near Discount/GST. Negative amounts work as extra discount.
- Selected services can show as a price-breakup table, or the breakup can be hidden.
- Service fees can be edited at quote time without changing the catalog price.
- Discount is calculated before GST.
- GST can be added as a percentage on the calculated value or an editable base.
- Add-ons can be entered manually or pulled from service add-on templates.
- Document categories can be managed separately, so 100+ document templates stay organized.
- Document templates can be managed from Documents and linked to services.
- Service document pickers are compact and grouped by category.
- Quote documents are grouped service-wise, editable per quote, and support extra custom documents.
- Canned messages can be managed from Messages and added to quote notes.
- Service records include a default extra-cost T&C for government fees and out-of-pocket expenses.
- Email tracking has a database table ready for sent/opened/clicked/failed events.
- Quotation footer phone numbers can be edited from Settings.
- Quote detail can send the saved quote by email through Brevo once `BREVO_API_KEY` is configured.
- Quote detail includes a WhatsApp brief copy button and print/save-PDF button for manual sharing.
- New Quote can now save draft, send email, prepare WhatsApp/PDF, or do email + WhatsApp in one flow.
- Pipeline now supports category, follow-up date, and comment fields.
- Campaigns now have a real database foundation for manual lists, dynamic lists, and campaign drafts.
- Quote builder supports searchable services, category filters, custom service lines, add-ons, and tags.
- Draft quote creation.
- Quotes list view.
- Pipeline filters for period, custom dates, status, and tags.
- Pipeline has kanban and list views; status can be changed from the list view.
- Clients page that does not expose bulk contact details.
- Pipeline, compliance, campaigns, settings, and activity foundations.
- Leads workspace with assignment, reminders, notes, and dashboard visibility.
- WhatsApp inbox storage with Meta Cloud API webhook support.
- Lead intake routes for Meta lead ads, Google Forms, website forms, and auto-created WhatsApp leads.
- One-click quote creation from a lead, with quote prefill and lead timeline linkage.
- Lead reminder cron endpoint for scheduled callback processing.
- Pricing unit tests.

## What Is Not Connected Yet

- Your Supabase project keys.
- Real team users.
- Brevo domain/sender authentication in your Brevo account.
- Google Sheet hourly sync.
- Public quote accept page.
- Contact reveal workflow.
- Drip automation.
- WhatsApp template automation beyond plain reply sending.

These are next modules, not missing from the plan.

## What I Need From You Next

Create or share a Supabase project. I need these values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

After that, the database migration in `supabase/migrations/0001_initial_schema.sql` must be run in Supabase SQL editor.

If your Supabase database already exists, also run:

```text
supabase/migrations/0002_quote_pricing_settings_and_google_sync.sql
supabase/migrations/0003_quote_composer_libraries.sql
supabase/migrations/0004_document_categories_and_compact_composer.sql
supabase/migrations/0005_pipeline_campaign_lists.sql
supabase/migrations/0006_pipeline_taxonomy.sql
supabase/migrations/0007_drip_automation.sql
supabase/migrations/0008_whatsapp_template_fields.sql
supabase/migrations/0009_quote_company_and_mobile_snapshot.sql
supabase/migrations/0010_multi_currency.sql
supabase/migrations/0015_leads_crm_v1.sql
supabase/migrations/0016_lead_intake_pipeline.sql
```

These migrations add the newer service, quotation, document-library, document-category, pipeline, campaign-list, drip, WhatsApp template, quote snapshot, multi-currency, canned-message, Google Sheet sync, lead CRM fields, and the new lead intake pipeline. If service add/edit says "server error", these migrations are the first thing to check.

## Password Reset Setup

The app now has:

```text
/forgot-password
/reset-password
/auth/callback?next=/reset-password
```

In Supabase Auth settings, add this redirect URL:

```text
https://YOUR_APP_DOMAIN/auth/callback?next=/reset-password
```

For local testing, also add:

```text
http://localhost:3000/auth/callback?next=/reset-password
```

Set `APP_BASE_URL` in your environment to the same app domain. The Forgot Password form uses this when sending reset emails.

## How To Link Your Google Sheet

The app now has a backend sync endpoint for your existing client list.

You need:

```text
GOOGLE_SHEETS_CLIENT_LIST_ID
GOOGLE_SHEETS_CLIENT_LIST_RANGE
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

Recommended steps:

1. Create a Google Cloud service account.
2. Copy the service account email.
3. Create a JSON key for that service account.
4. Add the service account email as a Viewer on your Google Sheet.
5. Put the Sheet ID into `GOOGLE_SHEETS_CLIENT_LIST_ID`.
6. Put the tab/range into `GOOGLE_SHEETS_CLIENT_LIST_RANGE`, for example `Clients!A:Z`.
7. Put the service account email and private key into your environment variables.
8. Open Settings in the app and click `Run client sync now`.

The sync looks for common column names such as:

```text
Client ID / Client Code / Code
Group ID
Client Name / Name / Party Name / Customer Name
Company Name
Client Type
Source
Acquired Date
Notes / Remarks
```

It creates or updates records in `clients`. It does not create contact detail records from this sheet.

## How Quote Email Sending Works

The app sends quote emails through Brevo's transactional email API. Add these environment variables:

```text
BREVO_API_KEY
QUOTE_FROM_EMAIL=roc@onlinesbs.in
QUOTE_FROM_NAME=Smart Business Solutions - Companyji
QUOTE_REPLY_TO_EMAIL=roc@onlinesbs.in
```

No MCP API key is needed for Brevo. MCP is only for connecting tools to Codex; the web app sends directly to Brevo's API.

The sender email must be verified in Brevo. After that, open any quote detail page and click `Send email`.

Lead CRM and WhatsApp deployment instructions now live in `LEADS_CRM_DEPLOYMENT.md`.

For your cold calling tracker workbook, the lead sync expects these tabs by default:

```text
Cold Calling Leads
Whatsapp Leads CCFS
META leads
```

Set:

```text
GOOGLE_SHEETS_LEAD_TRACKER_ID
GOOGLE_SHEETS_LEAD_TRACKER_RANGES=Cold Calling Leads!A:O|Whatsapp Leads CCFS!A:R|META leads!A:L
```

## Important Local Note

This app requires Node.js 20.19 or newer. This machine is currently running a compatible Node version, and the production build has been verified locally.

Vercel should use Node 20+ for deployment.

## Next Module To Build

User management + roles:

- Admin can create/disable users.
- User role stored in `profiles`.
- Shared-office attribution list.
- Last-active tracking.
- Server-side permission checks.

After that, we should build:

1. T&C clauses CRUD.
2. Secure clients/contact reveal.
3. Secure quote sending, email templates, and tracking.
4. Email sending + quote tracking.
5. Google Sheets sync.
