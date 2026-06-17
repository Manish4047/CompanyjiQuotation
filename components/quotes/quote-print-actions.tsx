"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function QuotePrintActions({ quoteId }: { quoteId: string }) {
  return (
    <div className="quote-print-actions no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d9ded1] bg-white p-3 shadow-sm">
      <Link href={`/quotes/${quoteId}`}>
        <Button type="button" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
          Back to quote
        </Button>
      </Link>
      <Button type="button" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Save as PDF
      </Button>
    </div>
  );
}
