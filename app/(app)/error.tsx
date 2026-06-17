"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Route-group error boundary for everything under (app).
 * Renders inside the AppShell, so the user keeps their navigation.
 */
export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep stack traces in the server logs but show a calm message to the user.
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong loading this page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-neutral-700">
          <p>
            The page hit an unexpected error. Your data was not changed. You can try again, or open the
            dashboard and come back.
          </p>
          {error.message ? (
            <pre className="overflow-auto rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-xs text-neutral-600">
              {error.message}
            </pre>
          ) : null}
          {error.digest ? (
            <p className="text-xs text-neutral-500">Reference: {error.digest}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => reset()}>
              Try again
            </Button>
            <Link href="/dashboard">
              <Button type="button" variant="ghost">
                Open dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
