import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { requireProfile } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { parseQuoteFooterSettings } from "@/lib/settings";
import { runGoogleClientSync, runGoogleLeadSync, updateQuoteFooterSettings } from "./actions";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const isAdmin = canManageUsers(profile.role);
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "quote_footer").maybeSingle();
  const footer = parseQuoteFooterSettings(data?.value);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Settings</p>
        <h1 className="mt-1 text-3xl font-black text-black">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          API keys stay in environment variables, not in browser code. Admin settings will control drips, WhatsApp, quote
          validity, branding, and email signatures.
        </p>
      </header>

      {params.error ? (
        <div className="rounded-md border border-[#f4c7c3] bg-[#fff0ed] p-4 text-sm font-semibold text-[#b42318]">
          {params.error}
        </div>
      ) : null}
      {params.success ? (
        <div className="rounded-md border border-[#d9ead3] bg-[#edf7df] p-4 text-sm font-semibold text-[#405f16]">
          {params.success}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Quotation footer</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <form action={updateQuoteFooterSettings} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Assistance label">
                  <Input name="assistanceLabel" defaultValue={footer.assistanceLabel} />
                </Field>
                <Field label="Assistance phone">
                  <Input name="assistancePhone" defaultValue={footer.assistancePhone} />
                </Field>
                <Field label="Consultancy label">
                  <Input name="consultancyLabel" defaultValue={footer.consultancyLabel} />
                </Field>
                <Field label="Consultancy phone">
                  <Input name="consultancyPhone" defaultValue={footer.consultancyPhone} />
                </Field>
                <Field label="WhatsApp label">
                  <Input name="whatsappLabel" defaultValue={footer.whatsappLabel} />
                </Field>
                <Field label="WhatsApp phone">
                  <Input name="whatsappPhone" defaultValue={footer.whatsappPhone} />
                </Field>
              </div>
              <Field label="Footer line">
                <Input name="footerLine" defaultValue={footer.footerLine} />
              </Field>
              <Button type="submit">Save footer settings</Button>
            </form>
          ) : (
            <div className="text-sm leading-6 text-neutral-600">Only Admin users can change quotation footer settings.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Sheet client sync</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            This sync reads your existing client list and creates or updates client records. It does not import contact
            emails or mobiles unless you later choose to add that mapping.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-neutral-600">
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            Required environment variables:
            <pre className="mt-3 overflow-auto rounded-md bg-black p-3 text-xs text-white">
              {`GOOGLE_SHEETS_CLIENT_LIST_ID
GOOGLE_SHEETS_CLIENT_LIST_RANGE
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`}
            </pre>
          </div>
          {isAdmin ? (
            <form action={runGoogleClientSync}>
              <Button type="submit" variant="ghost">Run client sync now</Button>
            </form>
          ) : (
            <p>Only Admin users can run the Google Sheet sync.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Sheet lead sync</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            This sync is for your cold calling tracker workbook. It reads the `Cold Calling Leads`, `Whatsapp Leads CCFS`,
            and `META leads` tabs and imports them into `/leads`.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-neutral-600">
          <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
            Required environment variables:
            <pre className="mt-3 overflow-auto rounded-md bg-black p-3 text-xs text-white">
              {`GOOGLE_SHEETS_LEAD_TRACKER_ID
GOOGLE_SHEETS_LEAD_TRACKER_RANGES
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`}
            </pre>
          </div>
          {isAdmin ? (
            <form action={runGoogleLeadSync}>
              <Button type="submit" variant="ghost">Run lead sync now</Button>
            </form>
          ) : (
            <p>Only Admin users can run the Google Sheet lead sync.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
