import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

type Schedule = {
  id: string;
  deadline_type: string;
  due_date: string;
  status: string;
  companies: { name: string } | null;
};

export default async function CompliancePage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // The header promises "15-day, 7-day, 3-day, and overdue messages" — we have
  // to actually fetch overdue rows for that to be true.
  const [{ data: upcomingData }, { data: overdueData }] = await Promise.all([
    supabase
      .from("compliance_schedules")
      .select("id,deadline_type,due_date,status,companies(name)")
      .gte("due_date", today)
      .order("due_date")
      .limit(30),
    supabase
      .from("compliance_schedules")
      .select("id,deadline_type,due_date,status,companies(name)")
      .lt("due_date", today)
      .neq("status", "filed")
      .order("due_date", { ascending: false })
      .limit(30)
  ]);

  const upcoming = (upcomingData ?? []) as unknown as Schedule[];
  const overdue = (overdueData ?? []) as unknown as Schedule[];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Compliance calendar</p>
        <h1 className="mt-1 text-3xl font-black text-black">Next deadlines</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Compliance reminders use this schedule table for 15-day, 7-day, 3-day, and overdue alerts.
        </p>
      </header>

      {overdue.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Overdue{" "}
              <StatusPill tone="red">{overdue.length}</StatusPill>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overdue.map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} tone="red" today={today} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length ? (
            upcoming.map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} today={today} />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
              Deadlines will appear here after company compliance schedules are added.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleRow({
  schedule,
  tone,
  today
}: {
  schedule: Schedule;
  tone?: "red";
  today: string;
}) {
  const daysOut = daysBetween(today, schedule.due_date);
  const urgencyTone =
    tone === "red"
      ? "red"
      : daysOut <= 3
        ? "red"
        : daysOut <= 7
          ? "amber"
          : daysOut <= 15
            ? "amber"
            : "muted";

  return (
    <article
      className={`rounded-md border p-4 ${
        tone === "red" ? "border-[#f4c7c3] bg-[#fff5f3]" : "border-[#e6ebdc] bg-[#fbfcf8]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black">{schedule.deadline_type}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {schedule.companies?.name ?? "Company"} · Due {formatDate(schedule.due_date)} · {schedule.status}
          </p>
        </div>
        <StatusPill tone={urgencyTone}>
          {tone === "red" ? `${Math.abs(daysOut)} day${Math.abs(daysOut) === 1 ? "" : "s"} overdue` : daysLabel(daysOut)}
        </StatusPill>
      </div>
    </article>
  );
}

function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const from = new Date(`${fromIsoDate}T00:00:00Z`).getTime();
  const to = new Date(`${toIsoDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function daysLabel(daysOut: number) {
  if (daysOut <= 0) return "Today";
  if (daysOut === 1) return "Tomorrow";
  return `In ${daysOut} days`;
}
