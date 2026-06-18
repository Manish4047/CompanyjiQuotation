# Simple Vercel Hosting Steps

Use this for Companyji CRM.

## Best Way

Use GitHub + Vercel. Do not upload `node_modules`, `.next`, or `.env.local`.

## Step 1: Put Code On GitHub

1. Open GitHub.
2. Create a new private repository, for example `companyji-crm`.
3. Upload/push this project folder:

```text
C:\Users\lenovo\Desktop\CompanyJiCRM\2026-04-21-https-claude-ai-share-3b8065a4-bf14
```

Upload these important files/folders:

```text
app
components
lib
supabase
tests
package.json
package-lock.json
next.config.mjs
tsconfig.json
postcss.config.mjs
middleware.ts
README.md
```

Do not upload:

```text
node_modules
.next
.env.local
coverage
test-results
playwright-report
```

## Step 2: Import In Vercel

1. Open Vercel.
2. Click `Add New -> Project`.
3. Choose the GitHub repository.
4. Set framework as `Next.js`.
5. Use these settings:

```text
Build Command: npm run build
Install Command: npm install
Output Directory: leave blank
Root Directory: leave blank if repo root is this project folder
Node Version: 20 or newer
```

If the GitHub repo contains the parent folder also, set root directory to:

```text
2026-04-21-https-claude-ai-share-3b8065a4-bf14
```

## Step 3: Add Environment Variables

In Vercel project settings, open `Environment Variables` and add these.

Minimum required:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_BASE_URL
CRON_SECRET
```

For WhatsApp, Meta leads, and Google Sheets also add:

```text
WHATSAPP_META_ACCESS_TOKEN
WHATSAPP_META_PHONE_NUMBER_ID
WHATSAPP_META_VERIFY_TOKEN
WHATSAPP_META_GRAPH_VERSION
WHATSAPP_DEFAULT_COUNTRY_CODE
META_LEAD_ACCESS_TOKEN
META_LEAD_VERIFY_TOKEN
META_GRAPH_VERSION
LEAD_INTAKE_SECRET
LEAD_AUTO_ASSIGN_MODE
LEAD_ROUTING_POOL_ROLES
LEAD_DEFAULT_ASSIGNEE_EMAIL
LEAD_DEFAULT_FOLLOW_UP_HOURS
GOOGLE_SHEETS_LEAD_TRACKER_ID
GOOGLE_SHEETS_LEAD_TRACKER_RANGES
```

Recommended values:

```text
APP_BASE_URL=https://YOUR-VERCEL-URL.vercel.app
WHATSAPP_META_GRAPH_VERSION=v23.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91
META_GRAPH_VERSION=v23.0
LEAD_AUTO_ASSIGN_MODE=round_robin
LEAD_ROUTING_POOL_ROLES=sales,executive
LEAD_DEFAULT_FOLLOW_UP_HOURS=2
```

## Step 4: Deploy

1. Click `Deploy`.
2. Wait for the build to finish.
3. Vercel will give a live URL like:

```text
https://companyji-crm.vercel.app
```

4. Copy this URL.
5. Update `APP_BASE_URL` in Vercel to the final live URL.
6. Redeploy once after changing `APP_BASE_URL`.

## Step 5: Supabase Login Setup

In Supabase Auth settings, add redirect URLs:

```text
https://YOUR-VERCEL-URL.vercel.app/auth/callback
https://YOUR-VERCEL-URL.vercel.app/auth/callback?next=/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/reset-password
```

Create 4-5 team members in Supabase Auth, then create their matching `profiles` rows.

Roles:

```text
admin - owner/full access
manager - sees all leads
sales - sees own assigned leads
executive - sees own assigned leads
shared_office - limited own work access
```

Example profile SQL:

```sql
insert into public.profiles (id, email, full_name, role, active)
values ('AUTH_USER_ID_HERE', 'person@companyji.com', 'Person Name', 'sales', true);
```

## Simple Team Use

1. Share the Vercel live URL with your 4-5 members.
2. Give each person their Supabase login email/password.
3. They open the same live URL in browser and work together.

## Important

Vercel hosts the app. Supabase stores the data and users. For a CRM used by 4-5 members, this setup is enough.

## Fix: Vercel Says No `app` Directory

If Vercel shows this error:

```text
Couldn't find any `pages` or `app` directory
```

It means GitHub does not contain the full project files, or Vercel is looking in the wrong folder.

Check GitHub. The repository must show these folders at the same level as `package.json`:

```text
app
components
lib
supabase
tests
```

If these folders are missing, upload them to GitHub from this local project folder:

```text
C:\Users\lenovo\Desktop\CompanyJiCRM\2026-04-21-https-claude-ai-share-3b8065a4-bf14
```

After uploading the missing folders, redeploy in Vercel.
