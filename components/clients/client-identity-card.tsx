"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateClientIdentity } from "@/app/(app)/clients/actions";
import { Input } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/utils";

export type ClientIdentityRecord = {
  id: string;
  code: string;
  group_id: string | null;
  name: string;
  client_type: string | null;
  source: string | null;
  status: string;
  last_interaction_at: string | null;
  created_at: string;
};

type EditableFieldName = "name" | "code" | "group";

export function ClientIdentityCard({ client }: { client: ClientIdentityRecord }) {
  const [clientName, setClientName] = useState(client.name);
  const [clientCode, setClientCode] = useState(client.code);
  const [groupId, setGroupId] = useState(client.group_id ?? "");
  const [editing, setEditing] = useState<Record<EditableFieldName, boolean>>({
    name: false,
    code: false,
    group: false
  });

  const hasActiveEdit = Object.values(editing).some(Boolean);
  const isDirty = clientName !== client.name || clientCode !== client.code || groupId !== (client.group_id ?? "");

  function startEdit(field: EditableFieldName) {
    setEditing((current) => ({ ...current, [field]: true }));
  }

  function cancelEditing() {
    setClientName(client.name);
    setClientCode(client.code);
    setGroupId(client.group_id ?? "");
    setEditing({
      name: false,
      code: false,
      group: false
    });
  }

  return (
    <article className="rounded-lg border border-[#e6ebdc] bg-white p-4 shadow-sm">
      <form action={updateClientIdentity} className="space-y-4">
        <input type="hidden" name="client_id" value={client.id} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {!editing.name ? (
                <>
                  <EditIconButton label="Edit client name" onClick={() => startEdit("name")} />
                  <h2 className="text-lg font-black text-black">{clientName}</h2>
                  <input type="hidden" name="client_name" value={clientName} />
                </>
              ) : (
                <Input
                  name="client_name"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  autoFocus
                  className="h-10 min-w-[240px] sm:w-[320px]"
                />
              )}
              <StatusPill>{client.status.replaceAll("_", " ")}</StatusPill>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
              <span>Type: {client.client_type || "Not set"}</span>
              <span>Source: {client.source || "Not set"}</span>
              <span>Created: {formatDate(client.created_at)}</span>
            </div>
          </div>

          <div className="rounded-md border border-[#eef1e7] bg-[#fbfcf8] px-3 py-2 text-xs font-semibold text-neutral-500">
            Last interaction: {formatDate(client.last_interaction_at)}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <InlineIdentityField
            label="Client ID"
            fieldName="client_code"
            value={clientCode}
            displayValue={clientCode}
            editing={editing.code}
            onEdit={() => startEdit("code")}
            onChange={setClientCode}
            placeholder="Client ID"
          />

          <InlineIdentityField
            label="Group ID"
            fieldName="group_id"
            value={groupId}
            displayValue={groupId || "Not set"}
            editing={editing.group}
            onEdit={() => startEdit("group")}
            onChange={setGroupId}
            placeholder="Optional group"
          />

          <div className="rounded-md border border-[#eef1e7] bg-[#fbfcf8] p-3">
            <p className="text-[11px] font-black uppercase text-neutral-500">Quick view</p>
            <p className="mt-2 text-sm font-semibold text-black">
              {clientName} | {clientCode} | {groupId || "No group"}
            </p>
          </div>
        </div>

        {hasActiveEdit || isDirty ? (
          <div className="flex items-center justify-end gap-2 border-t border-[#eef1e7] pt-3">
            <button
              type="button"
              onClick={cancelEditing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#d9ded1] bg-white px-3 text-sm font-black text-neutral-600"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <SaveButton disabled={!isDirty} />
          </div>
        ) : null}
      </form>
    </article>
  );
}

function InlineIdentityField({
  label,
  fieldName,
  value,
  displayValue,
  editing,
  onEdit,
  onChange,
  placeholder
}: {
  label: string;
  fieldName: string;
  value: string;
  displayValue: string;
  editing: boolean;
  onEdit: () => void;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-md border border-[#eef1e7] bg-[#fbfcf8] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase text-neutral-500">{label}</p>
        {!editing ? <EditIconButton label={`Edit ${label}`} onClick={onEdit} /> : null}
      </div>

      <div className="mt-2">
        {editing ? (
          <Input name={fieldName} value={value} onChange={(event) => onChange(event.target.value)} autoFocus placeholder={placeholder} />
        ) : (
          <>
            <input type="hidden" name={fieldName} value={value} />
            <p className="text-sm font-black text-black">{displayValue}</p>
          </>
        )}
      </div>
    </div>
  );
}

function EditIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d9ded1] bg-white text-neutral-500 transition hover:border-[#a0ce4e] hover:text-black"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      <Check className="h-4 w-4" />
      {pending ? "Saving" : "Save"}
    </button>
  );
}
