import { Button } from "@/components/ui/button";
import { ClientIdentityCard, type ClientIdentityRecord } from "@/components/clients/client-identity-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; sort?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id,code,group_id,name,client_type,source,status,last_interaction_at,created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  const clients = sortClients(filterClients((data ?? []) as ClientIdentityRecord[], params.q ?? ""), params.sort ?? "created_desc");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Client 360 foundation</p>
        <h1 className="mt-1 text-3xl font-black text-black">Clients</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Client records are separate from contact details. This page deliberately avoids showing emails or mobile
          numbers in bulk.
        </p>
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}

      <Card>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <Field label="Search">
              <Input name="q" defaultValue={params.q ?? ""} placeholder="Client name, Client ID, Group ID" />
            </Field>
            <Field label="Sort">
              <Select name="sort" defaultValue={params.sort ?? "created_desc"}>
                <option value="created_desc">Newest first</option>
                <option value="name_asc">Name</option>
                <option value="client_code_asc">Client ID</option>
                <option value="group_id_asc">Group ID</option>
              </Select>
            </Field>
            <Button type="submit" variant="ghost">
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{clients.length} clients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clients.length ? (
            clients.map((client) => <ClientIdentityCard key={client.id} client={client} />)
          ) : (
            <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
              Clients will appear here after quotes or imports create them.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function filterClients(clients: ClientIdentityRecord[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return clients;

  return clients.filter((client) =>
    [client.name, client.code, client.group_id ?? "", client.client_type ?? "", client.source ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

function sortClients(clients: ClientIdentityRecord[], sort: string) {
  const rows = [...clients];
  if (sort === "name_asc") return rows.sort((left, right) => left.name.localeCompare(right.name));
  if (sort === "client_code_asc") return rows.sort((left, right) => left.code.localeCompare(right.code));
  if (sort === "group_id_asc") return rows.sort((left, right) => (left.group_id || "ZZZZ").localeCompare(right.group_id || "ZZZZ"));
  return rows.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

