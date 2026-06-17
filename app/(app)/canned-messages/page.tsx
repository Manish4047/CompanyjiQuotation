import { CheckCircle2, CircleOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createCannedMessage, toggleCannedMessageActive, updateCannedMessage } from "./actions";

type CannedMessage = {
  id: string;
  title: string;
  category: string;
  body: string;
  use_case: string;
  active: boolean;
};

export default async function CannedMessagesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("canned_messages").select("*").order("category").order("title");
  const messages = (data ?? []) as CannedMessage[];
  const canManage = profile.role === "admin";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Quotation library</p>
        <h1 className="mt-1 text-3xl font-black text-black">Canned messages</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Save category-wise notes once, then add them to a quote without rewriting the same wording.
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
      {error ? (
        <div className="rounded-md border border-[#f4c7c3] bg-[#fff0ed] p-4 text-sm font-semibold text-[#b42318]">
          {friendlyReadError(error.message)}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Add message</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createCannedMessage} className="grid gap-4">
                <Field label="Title">
                  <Input name="title" placeholder="Government portal reality" required />
                </Field>
                <Field label="Category">
                  <Input name="category" placeholder="Timeline" required />
                </Field>
                <Field label="Use case">
                  <Select name="use_case" defaultValue="quote_note">
                    <option value="quote_note">Quote note</option>
                    <option value="documents">Documents</option>
                    <option value="follow_up">Follow-up</option>
                  </Select>
                </Field>
                <Field label="Message">
                  <Textarea name="body" placeholder="Plain-language client-facing text" required />
                </Field>
                <label className="flex items-center gap-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-sm font-semibold text-neutral-700">
                  <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                  Active
                </label>
                <Button type="submit">Save message</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Message access</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-neutral-600">
              You can view active canned messages. Only Admin users can add or edit the library.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{messages.length} messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.map((message) => (
              <article key={message.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black">{message.title}</h2>
                      <StatusPill>{message.category}</StatusPill>
                      <StatusPill>{message.use_case.replaceAll("_", " ")}</StatusPill>
                      <StatusPill tone={message.active ? "green" : "red"}>{message.active ? "Active" : "Inactive"}</StatusPill>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{message.body}</p>
                  </div>
                  {canManage ? (
                    <form action={toggleCannedMessageActive}>
                      <input type="hidden" name="id" value={message.id} />
                      <input type="hidden" name="active" value={String(!message.active)} />
                      <Button type="submit" variant="ghost">
                        {message.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        {message.active ? "Deactivate" : "Activate"}
                      </Button>
                    </form>
                  ) : null}
                </div>
                {canManage ? <CannedMessageEditDetails message={message} /> : null}
              </article>
            ))}
            {!messages.length ? (
              <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                No canned messages yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CannedMessageEditDetails({ message }: { message: CannedMessage }) {
  return (
    <details className="mt-4 rounded-md border border-[#d9ded1] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-black text-black">
        <Pencil className="h-4 w-4" />
        Edit message
      </summary>
      <form action={updateCannedMessage} className="grid gap-4 border-t border-[#e6ebdc] p-4">
        <input type="hidden" name="id" value={message.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <Input name="title" defaultValue={message.title} required />
          </Field>
          <Field label="Category">
            <Input name="category" defaultValue={message.category} required />
          </Field>
        </div>
        <Field label="Use case">
          <Select name="use_case" defaultValue={message.use_case}>
            <option value="quote_note">Quote note</option>
            <option value="documents">Documents</option>
            <option value="follow_up">Follow-up</option>
          </Select>
        </Field>
        <Field label="Message">
          <Textarea name="body" defaultValue={message.body} required />
        </Field>
        <label className="flex items-center gap-3 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3 text-sm font-semibold text-neutral-700">
          <input name="active" type="checkbox" value="true" defaultChecked={message.active} className="h-4 w-4" />
          Active
        </label>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  );
}

function friendlyReadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache")) {
    return "Canned messages could not load. Run migration 0003 in Supabase SQL Editor.";
  }
  return message;
}
