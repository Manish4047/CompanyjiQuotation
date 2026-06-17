import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

type Activity = {
  id: string;
  timestamp: string;
  user_email: string | null;
  action_type: string;
  related_client_id: string | null;
  related_quote_id: string | null;
  details: Record<string, unknown>;
};

export default async function ActivityPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; action?: string; user?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("id,timestamp,user_email,action_type,related_client_id,related_quote_id,details")
    .order("timestamp", { ascending: false })
    .limit(250);

  const logs = filterLogs((data ?? []) as Activity[], params);
  const actionOptions = [...new Set(((data ?? []) as Activity[]).map((log) => log.action_type))].sort();
  const userOptions = [...new Set(((data ?? []) as Activity[]).map((log) => log.user_email).filter(Boolean))].sort() as string[];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Audit trail</p>
        <h1 className="mt-1 text-3xl font-black text-black">Activity log</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Sensitive actions such as contact reveal, quote creation, status changes, exports, and configuration changes are recorded here.
        </p>
      </header>

      <Card>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto] lg:items-end">
            <Field label="Search">
              <Input name="q" defaultValue={params.q ?? ""} placeholder="quote, folder, client, export..." />
            </Field>
            <Field label="Action">
              <Select name="action" defaultValue={params.action ?? ""}>
                <option value="">Any action</option>
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {action.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="User">
              <Select name="user" defaultValue={params.user ?? ""}>
                <option value="">Any user</option>
                {userOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </Select>
            </Field>
            <button className="min-h-10 rounded-md border border-[#d9ded1] bg-white px-4 text-sm font-black text-black" type="submit">
              Filter
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{logs.length} actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead className="bg-[#f8f9f4] text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-3 font-black">Time</th>
                  <th className="px-3 py-3 font-black">Action</th>
                  <th className="px-3 py-3 font-black">User</th>
                  <th className="px-3 py-3 font-black">Reference</th>
                  <th className="px-3 py-3 font-black">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-[#eef1e7] align-top">
                    <td className="px-3 py-3 text-xs text-neutral-500">{formatDateTime(log.timestamp)}</td>
                    <td className="px-3 py-3">
                      <p className="font-black text-black">{log.action_type.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-700">{log.user_email || "System"}</td>
                    <td className="px-3 py-3 text-xs text-neutral-500">
                      {log.related_quote_id ? <p>Quote {shortId(log.related_quote_id)}</p> : null}
                      {log.related_client_id ? <p>Client {shortId(log.related_client_id)}</p> : null}
                      {!log.related_quote_id && !log.related_client_id ? <p>-</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <p className="max-w-[420px] text-sm leading-6 text-neutral-700">{detailSummary(log.details)}</p>
                    </td>
                  </tr>
                ))}
                {!logs.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-neutral-500">
                      No activity matches these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function filterLogs(logs: Activity[], params: { q?: string; action?: string; user?: string }) {
  const query = (params.q ?? "").trim().toLowerCase();
  return logs.filter((log) => {
    const actionMatch = !params.action || log.action_type === params.action;
    const userMatch = !params.user || log.user_email === params.user;
    const queryMatch =
      !query ||
      [log.action_type, log.user_email ?? "", JSON.stringify(log.details), log.related_quote_id ?? "", log.related_client_id ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return actionMatch && userMatch && queryMatch;
  });
}

function detailSummary(details: Record<string, unknown>) {
  const priorityKeys = ["quote_id_formatted", "name", "list_name", "campaign_name", "new_status", "channel", "subject"];
  const parts = priorityKeys
    .map((key) => details[key])
    .filter(Boolean)
    .map((value) => String(value));

  if (parts.length) return parts.join(" | ");
  const fallback = Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return fallback.length ? fallback.join(" | ") : "No extra details saved.";
}

function shortId(value: string) {
  return value.slice(0, 8);
}
