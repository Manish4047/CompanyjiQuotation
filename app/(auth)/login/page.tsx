import { Building2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { signInWithGoogle, signInWithPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SetupRequired } from "@/components/setup-required";
import { hasSupabaseConfig } from "@/lib/env";
import { getCurrentProfile } from "@/lib/auth/session";
import { routes } from "@/app/routes";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  if (!hasSupabaseConfig()) return <SetupRequired />;

  const params = await searchParams;
  const safeNext = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : null;

  const profile = await getCurrentProfile();
  if (profile) redirect((safeNext ?? "/dashboard") as Route);

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#f4f4f4] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-[#a0ce4e] font-black text-black">Cj</div>
              <div>
                <CardTitle>Sign in to Companyji</CardTitle>
                <p className="mt-1 text-sm text-neutral-500">Create quotes, track leads, and keep follow-up simple.</p>
              </div>
            </div>
            {params.message ? (
              <Notice tone="red" className="p-3">
                {params.message}
              </Notice>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {safeNext ? (
              <p className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-xs leading-5 text-neutral-600">
                Sign in to continue to <span className="font-bold text-black">{safeNext}</span>.
              </p>
            ) : null}
            <form action={signInWithPassword} className="space-y-4">
              {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder="name@companyji.com"
                />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" autoComplete="current-password" required />
              </Field>
              <div className="text-right">
                <Link href={routes.forgotPassword as Route} className="text-sm font-bold text-[#6a912f]">
                  Forgot password?
                </Link>
              </div>
              <Button className="w-full" type="submit">
                Sign in
              </Button>
            </form>
            <form action={signInWithGoogle}>
              {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
              <Button className="w-full" type="submit" variant="ghost">
                Continue with Google
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="hidden bg-black p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm text-neutral-300">
            <Building2 className="h-4 w-4 text-[#a0ce4e]" />
            Since 2009
          </div>
          <h1 className="text-5xl font-black leading-tight">
            Handle the side of business that usually slows people down.
          </h1>
          <p className="mt-6 text-lg leading-8 text-neutral-300">
            Build quotes quickly, keep the process clear, and let clients decide when they are ready. No pressure
            tactics, no confusing fine print.
          </p>
        </div>
        <p className="text-sm text-neutral-400">Companyji CRM is for internal team use only.</p>
      </section>
    </main>
  );
}
