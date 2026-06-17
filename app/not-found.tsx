import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f4f4] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-neutral-700">
          <p>The page you were looking for moved, was deleted, or never existed.</p>
          <Link href="/dashboard">
            <Button type="button">Open dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
