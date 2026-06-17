import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompaniesPage() {
  return (
    <PageShell
      eyebrow="Companies"
      title="Companies"
      text="This module will track companies separately from clients, including CIN, GST, directors, capital, state, services taken, and compliance schedules."
    />
  );
}

function PageShell({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black text-black">{title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in the Companies module</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-neutral-600">{text}</CardContent>
      </Card>
    </div>
  );
}
