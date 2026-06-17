import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ENV_TEMPLATE = `NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=`;

export function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f4f4] p-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Supabase setup is needed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-neutral-700">
          <p>
            The Companyji app files are ready, but the database keys are not connected yet. Add the values from your
            Supabase project to <code className="rounded bg-neutral-100 px-1 py-0.5">.env.local</code>.
          </p>
          <pre
            className="overflow-auto rounded-md bg-black p-4 text-xs text-white"
            aria-label="Required environment variables"
          >
            {ENV_TEMPLATE}
          </pre>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Paste the three values from Supabase → Project Settings → API.</li>
            <li>
              Run the SQL migration in <code className="rounded bg-neutral-100 px-1 py-0.5">supabase/migrations</code>.
            </li>
            <li>Restart the app (<code className="rounded bg-neutral-100 px-1 py-0.5">npm run dev</code>).</li>
          </ol>
          <p className="text-xs text-neutral-500">
            The service-role key is only read on the server. It never reaches the browser.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
