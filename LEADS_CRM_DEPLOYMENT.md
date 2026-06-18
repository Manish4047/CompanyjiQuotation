# Companyji Leads CRM - V1 Build and V2 Roadmap

This document is the practical deployment guide for the new lead CRM module inside Companyji CRM.

## V1 included in this build

- Supabase Auth login using the existing `profiles` role model.
- Agent-wise lead visibility:
  - `admin` sees and controls everything.
  - `manager` sees all leads and all WhatsApp conversations.
  - `sales`, `executive`, and `shared_office` behave like agents and only work their own assigned or self-created leads/conversations.
- Lead workspace at `/leads`:
  - lead creation
  - lead assignment
  - status pipeline
  - notes/activity log
  - callback reminders
  - source intake history
  - create-quote handoff from lead to quote builder
  - dashboard visibility
- WhatsApp inbox at `/whatsapp-inbox`:
  - stores inbound messages from Meta Cloud API webhooks
  - stores outbound replies
  - links conversations to leads
  - supports manager routing
- Lead intake routes:
  - `POST /api/meta/leadgen/webhook`
  - `POST /api/leads/intake/google-form`
  - `POST /api/leads/intake`
  - unknown WhatsApp numbers auto-create leads through the same intake engine
- Google Sheets lead tracker sync:
  - `POST /api/sync/google-leads`
  - pulls `Cold Calling Leads`, `Whatsapp Leads CCFS`, and `META leads`
- Reminder scheduler endpoint at `/api/cron/lead-reminders`.

## Database setup

Run all migrations in order, including the new lead CRM migration:

```text
supabase/migrations/0001_initial_schema.sql
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

Create users in Supabase Auth, then create matching `profiles` rows.

Recommended role mapping for your team:

- `admin`: owner / super-admin
- `manager`: team leaders who must see every lead
- `sales` or `executive`: agents who should only see their own leads

Example:

```sql
insert into public.profiles (id, email, full_name, role, active)
values
  ('AUTH_USER_ID', 'manager@companyji.com', 'Team Manager', 'manager', true);
```

## Required environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_BASE_URL
CRON_SECRET

WHATSAPP_META_ACCESS_TOKEN
WHATSAPP_META_PHONE_NUMBER_ID
WHATSAPP_META_VERIFY_TOKEN
WHATSAPP_META_GRAPH_VERSION=v23.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91

META_LEAD_ACCESS_TOKEN
META_LEAD_VERIFY_TOKEN
META_GRAPH_VERSION=v23.0

LEAD_INTAKE_SECRET
LEAD_AUTO_ASSIGN_MODE=round_robin
LEAD_ROUTING_POOL_ROLES=sales,executive
LEAD_DEFAULT_ASSIGNEE_EMAIL
LEAD_DEFAULT_FOLLOW_UP_HOURS=2

GOOGLE_SHEETS_LEAD_TRACKER_ID
GOOGLE_SHEETS_LEAD_TRACKER_RANGES=Cold Calling Leads!A:O|Whatsapp Leads CCFS!A:R|META leads!A:L
```

## Meta Cloud API setup

1. In Meta Developers, create or open the app connected to your WhatsApp Business number.
2. Add the WhatsApp product.
3. Copy the permanent access token into `WHATSAPP_META_ACCESS_TOKEN`.
4. Copy the business phone number ID into `WHATSAPP_META_PHONE_NUMBER_ID`.
5. Choose any strong random string for `WHATSAPP_META_VERIFY_TOKEN`.
6. Set the webhook callback URL to:

```text
https://YOUR_DOMAIN/api/whatsapp/webhook
```

7. Use the same verify token in Meta and in your app environment.
8. Subscribe to at least message and message-status events.

## Meta Lead Ads setup

1. Use the same Meta app or another app with Lead Ads access.
2. Save the lead-retrieval access token into `META_LEAD_ACCESS_TOKEN`.
3. Save a webhook verify token into `META_LEAD_VERIFY_TOKEN`.
4. Set the lead ads webhook callback URL to:

```text
https://YOUR_DOMAIN/api/meta/leadgen/webhook
```

5. Subscribe to the Page `leadgen` field.
6. Every new Meta instant-form lead will:
   - hit the webhook
   - fetch the actual lead fields from Meta
   - dedupe by phone / WhatsApp / email
   - create or merge a lead in `/leads`
   - create the first reminder automatically

## Google Forms setup

Use the installable Apps Script trigger sample in:

```text
GOOGLE_FORMS_LEAD_INTAKE_APPS_SCRIPT.js
```

Point it at:

```text
https://YOUR_DOMAIN/api/leads/intake/google-form
```

Use this header:

```text
Authorization: Bearer YOUR_LEAD_INTAKE_SECRET
```

This route accepts:

- `form_id`
- `form_name`
- `response_id`
- `submitted_at`
- `answers`

The CRM maps common question names like company name, full name, phone, WhatsApp, email, and keeps extra answers in the lead remarks.

## Live Google Sheet row setup

If leads are being added directly into a Google Sheet, use:

```text
GOOGLE_SHEETS_LIVE_LEAD_INTAKE_APPS_SCRIPT.js
```

Recommended columns in the sheet:

```text
company_name
contact_name
director_name
phone
whatsapp_number
email
remarks
tags
source
```

Setup flow:

1. Open the Google Sheet.
2. Go to `Extensions -> Apps Script`.
3. Paste the file contents from `GOOGLE_SHEETS_LIVE_LEAD_INTAKE_APPS_SCRIPT.js`.
4. Set:
   - `CRM_WEBHOOK_URL` to `https://YOUR_DOMAIN/api/leads/intake`
   - `CRM_SECRET` to your `LEAD_INTAKE_SECRET`
   - `SHEET_NAME` to the tab that stores live leads
5. Run `installLeadSheetTrigger()` once.
6. Approve the Apps Script permissions.
7. Add a new row in that sheet and it will be pushed into `/leads`.

Notes:

- This script is best when each row is a new lead.
- It writes `crm_pushed_at` and `crm_lead_id` back into the sheet.
- If you need to resend a row after editing it, select the row and run `repushSelectedRow()`.

## Pull-sync for your existing cold calling tracker

If you already have lead history stored in one Google Sheet workbook, use the built-in pull sync instead of Apps Script.

For your workbook, the CRM now expects these tabs:

```text
Cold Calling Leads
Whatsapp Leads CCFS
META leads
```

Set:

```text
GOOGLE_SHEETS_LEAD_TRACKER_ID=YOUR_SPREADSHEET_ID
GOOGLE_SHEETS_LEAD_TRACKER_RANGES=Cold Calling Leads!A:O|Whatsapp Leads CCFS!A:R|META leads!A:L
```

What the sync imports:

- `COMPANY NAME` -> lead company
- `DIRECTOR NAME` -> primary contact
- `CIN` -> CIN
- `NUMBER` -> phone and WhatsApp
- `REMARK` -> lead notes
- `LEAD QUALITY ON 5` -> lead quality
- `Email` / `Email Address` -> email
- follow-up columns like `1st followup date`, `Followup date`, `FOLLOWUP`
- stage/status columns as CRM status hints and tags

You can run it from `Settings -> Google Sheet lead sync` or call:

```text
POST https://YOUR_DOMAIN/api/sync/google-leads
Authorization: Bearer YOUR_CRON_SECRET
```

## Website form / custom source setup

Any website, landing page, or automation tool can post directly to:

```text
https://YOUR_DOMAIN/api/leads/intake
```

Recommended JSON body:

```json
{
  "source": "website_form",
  "external_id": "landing-page-2026-06-09-001",
  "form_name": "Main consultation form",
  "company_name": "Acme Private Limited",
  "contact_name": "Ravi Kumar",
  "phone": "9876543210",
  "whatsapp_number": "9876543210",
  "email": "owner@acme.com",
  "remarks": "Asked about GST + ROC support",
  "tags": "homepage,june-campaign"
}
```

## Vercel and custom domain deployment

1. Push this repo to GitHub.
2. Import the project into Vercel.
3. Set all environment variables from this document.
4. Set Node 20+ in Vercel.
5. Add your domain in Vercel.
6. Update `APP_BASE_URL` to the final HTTPS domain.
7. In Supabase Auth, add these redirect URLs:

```text
https://YOUR_DOMAIN/auth/callback
https://YOUR_DOMAIN/auth/callback?next=/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/reset-password
```

## Reminder scheduler deployment

Create a cron job that sends a `POST` request to:

```text
https://YOUR_DOMAIN/api/cron/lead-reminders
```

Send the header:

```text
Authorization: Bearer YOUR_CRON_SECRET
```

Recommended schedule:

- every 5 minutes for active lead teams

This V1 scheduler marks due reminders as notified and logs them into the lead activity stream. It is the correct backend hook for later email, push, or WhatsApp reminder delivery.

## Recommended lead operating flow

1. New leads enter from Meta, Google Forms, website forms, WhatsApp, or manual entry.
2. CRM auto-assigns the lead or keeps it unassigned for manager review.
3. A first follow-up reminder is created automatically.
4. Agents work the lead inside `/leads` and always leave notes plus next action.
5. When the lead is qualified, click `Create quote` from the lead.
6. The quote is linked back to the lead, and the lead timeline records that handoff.

## Team size guidance for 10-20 users

This V1 is appropriate for your current team size if you keep the app on:

- Vercel for the Next.js app
- Supabase Pro for database/auth/storage

That is enough for 10-20 internal users, lead assignment, and one WhatsApp business number.

## Recommended V2 production CRM

Build V2 after the team uses V1 for 2-4 weeks and you have real workflow feedback.

### V2 priorities

- duplicate detection by CIN + phone + WhatsApp
- manager SLA dashboards:
  - new lead ageing
  - overdue callbacks
  - agent response time
  - conversion by source and agent
- WhatsApp template sending for approved utility and marketing templates
- bulk assignment and round-robin routing
- audit-safe lead transfer history
- notification delivery to email / mobile / WhatsApp for internal reminders
- campaign broadcasts and drip sequences tied to lead stages
- richer dashboard inspired by LeadSquared:
  - source funnel
  - agent leaderboard
  - stage ageing
  - overdue bucket
- mobile-first agent workflow
- call outcome shortcuts and next-best-action suggestions

### V2 architecture recommendation

- Keep Next.js + Supabase for the app and database.
- Add a dedicated worker layer for heavy jobs:
  - webhook retries
  - campaign sending
  - reminder fan-out
  - imports
- Use queues for outbound WhatsApp and automation jobs.
- Add observability:
  - failed webhook alerts
  - cron success/failure logs
  - delivery status tracking

## Suggested go-live order

1. Run migration `0015_leads_crm_v1.sql`.
2. Create manager and agent users in Supabase Auth + `profiles`.
3. Configure Meta webhook and env vars.
4. Deploy to your production domain.
5. Add the reminder cron job.
6. Import or manually create the first working set of leads.
7. Let one manager and 2-3 agents use it for a few days before onboarding the full team.
