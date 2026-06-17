"use client";

import { useId, useState } from "react";
import { Plus, Pencil, ChevronRight, ChevronDown } from "lucide-react";
import {
  DocumentTemplateCheckboxes,
  type ServiceDocumentTemplateOption
} from "@/components/services/service-create-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { RichTextTextarea } from "@/components/ui/rich-text-textarea";
import { createService, updateService } from "@/app/(app)/services/actions";
import { defaultCurrencyCode, supportedCurrencyOptions } from "@/lib/currency";
import { cn } from "@/lib/utils";

type ServiceForDrawer = {
  id: string;
  code: string;
  name: string;
  category: string;
  pricing_mode: "fixed" | "engagement_based" | "retainership";
  currency_code: string;
  prepaid_fee: number;
  postpaid_fee: number;
  retainership_fee: number;
  retainership_cycle: "monthly" | "quarterly" | "yearly";
  short_description: string;
  full_description: string;
  first_installment: number | null;
  prepaid_description: string;
  postpaid_description: string;
  first_trigger: string | null;
  second_trigger: string | null;
  timeline_typical: string | null;
  inclusions: string;
  not_included: string;
  required_documents: string;
  extra_costs_clause: string;
  state_variations_apply: boolean;
  is_addon_template: boolean;
  active: boolean;
  internal_notes: string | null;
  document_template_ids: string[];
};

type ServiceDrawerProps = {
  documentTemplates: ServiceDocumentTemplateOption[];
  categories: string[];
  /** When provided, the drawer opens in edit mode for this service. */
  service?: ServiceForDrawer;
  /** Custom trigger renderer. Defaults to the standard "+ Add service" / "Edit" button. */
  trigger?: (open: () => void) => React.ReactNode;
};

/**
 * Slide-over panel that handles both creating and editing a service.
 *
 * Architecture: every field name appears at most once in the DOM so form
 * submission is unambiguous. Quick Add shows a curated subset; Advanced
 * expands the full set. Switching tabs hides/shows groups but never moves
 * fields between them, so values you type don't disappear when you switch.
 */
export function ServiceDrawer({ documentTemplates, categories, service, trigger }: ServiceDrawerProps) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(service);

  const renderTrigger = () => {
    if (trigger) return trigger(() => setOpen(true));
    if (isEdit) {
      return (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      );
    }
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add service
      </Button>
    );
  };

  return (
    <>
      {renderTrigger()}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit service · ${service?.name}` : "Add service"}
        description={
          isEdit
            ? "Update pricing, scope, or descriptions. Existing quotes keep their snapshot."
            : "Quick Add captures the essentials. Open Advanced for descriptions, inclusions, and documents."
        }
      >
        <ServiceDrawerForm
          documentTemplates={documentTemplates}
          categories={categories}
          service={service}
          onCancel={() => setOpen(false)}
        />
      </Drawer>
    </>
  );
}

function ServiceDrawerForm({
  documentTemplates,
  categories,
  service,
  onCancel
}: {
  documentTemplates: ServiceDocumentTemplateOption[];
  categories: string[];
  service?: ServiceForDrawer;
  onCancel: () => void;
}) {
  const isEdit = Boolean(service);
  const action = isEdit ? updateService : createService;
  const [tab, setTab] = useState<"quick" | "advanced">("quick");
  const [pricingMode, setPricingMode] = useState<ServiceForDrawer["pricing_mode"]>(
    service?.pricing_mode ?? "fixed"
  );
  const categoryFieldId = useId();

  // Government / out-of-pocket clauses are derived from a single text column on
  // the database. The two checkboxes round-trip through it.
  const hasGovFees = service ? service.extra_costs_clause.toLowerCase().includes("government fees") : true;
  const hasOOP = service ? service.extra_costs_clause.toLowerCase().includes("out-of-pocket") : true;

  return (
    <form action={action} className="flex h-full flex-col gap-5">
      {isEdit ? <input type="hidden" name="id" value={service?.id} /> : null}

      <Tabs
        tab={tab}
        onChange={setTab}
        items={[
          { value: "quick", label: "Quick Add" },
          { value: "advanced", label: "Advanced" }
        ]}
      />

      {tab === "quick" ? (
        <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] px-4 py-3 text-xs leading-5 text-neutral-600">
          {isEdit
            ? "These are the fields you change most. Switch to Advanced for inclusions, documents, and flags."
            : "Fill these and save. You can polish inclusions and documents anytime later from the row."}
        </div>
      ) : null}

      {/* IDENTITY ---------------------------------------------------------- */}
      <SubSection label="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service name">
            <Input
              name="name"
              defaultValue={service?.name ?? ""}
              placeholder="Private Limited Registration"
              required
            />
          </Field>
          <Field label="Category" hint="Existing or new — start typing.">
            <Combobox
              id={categoryFieldId}
              name="category"
              options={categories}
              defaultValue={service?.category ?? ""}
              placeholder="Incorporation"
              allowCreate
              required
            />
          </Field>
        </div>
        {tab === "advanced" ? (
          <Field label="Service code" hint="Leave blank to auto-generate from the name.">
            <Input name="code" defaultValue={service?.code ?? ""} />
          </Field>
        ) : (
          <input type="hidden" name="code" value={service?.code ?? ""} />
        )}
      </SubSection>

      {/* PRICING ----------------------------------------------------------- */}
      <SubSection label="Pricing">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pricing mode">
            <Select
              name="pricing_mode"
              value={pricingMode}
              onChange={(event) =>
                setPricingMode(event.target.value as ServiceForDrawer["pricing_mode"])
              }
            >
              <option value="fixed">Fixed (one-time)</option>
              <option value="engagement_based">Engagement based</option>
              <option value="retainership">Retainership</option>
            </Select>
          </Field>

          <Field label="Currency">
            <Select name="currency_code" defaultValue={service?.currency_code ?? defaultCurrencyCode}>
              {supportedCurrencyOptions.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </Field>

          {pricingMode === "retainership" ? (
            <>
              <Field label="Retainership fee" hint="Per cycle.">
                <Input
                  name="retainership_fee"
                  type="number"
                  min="0"
                  defaultValue={service?.retainership_fee ?? 0}
                />
              </Field>
              <Field label="Billing cycle">
                <Select name="retainership_cycle" defaultValue={service?.retainership_cycle ?? "monthly"}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </Field>
              {/* prepaid/postpaid fees are required by the server schema but get
                  overwritten with retainership_fee when pricing_mode is
                  retainership — see services/actions.ts parseServiceForm. */}
              <input type="hidden" name="prepaid_fee" value={0} />
              <input type="hidden" name="postpaid_fee" value={0} />
            </>
          ) : (
            <>
              <Field label="Prepaid fee" hint="Full payment upfront.">
                <Input
                  name="prepaid_fee"
                  type="number"
                  min="0"
                  defaultValue={service?.prepaid_fee ?? 0}
                />
              </Field>
              <Field label="Postpaid fee" hint="Milestone-based.">
                <Input
                  name="postpaid_fee"
                  type="number"
                  min="0"
                  defaultValue={service?.postpaid_fee ?? 0}
                />
              </Field>
              <input type="hidden" name="retainership_fee" value={service?.retainership_fee ?? 0} />
              <input
                type="hidden"
                name="retainership_cycle"
                value={service?.retainership_cycle ?? "monthly"}
              />
            </>
          )}
        </div>

        {tab === "advanced" && pricingMode !== "retainership" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prepaid description">
              <Input name="prepaid_description" defaultValue={service?.prepaid_description ?? ""} />
            </Field>
            <Field label="Postpaid description">
              <Input name="postpaid_description" defaultValue={service?.postpaid_description ?? ""} />
            </Field>
            <Field label="Postpaid - first installment">
              <Input
                name="first_installment"
                type="number"
                min="0"
                defaultValue={service?.first_installment ?? ""}
              />
            </Field>
            <Field label="Postpaid - first installment trigger">
              <Input name="first_trigger" defaultValue={service?.first_trigger ?? ""} />
            </Field>
            <Field label="Postpaid - second installment trigger">
              <Input name="second_trigger" defaultValue={service?.second_trigger ?? ""} />
            </Field>
          </div>
        ) : (
          <>
            <input type="hidden" name="prepaid_description" value={service?.prepaid_description ?? ""} />
            <input type="hidden" name="postpaid_description" value={service?.postpaid_description ?? ""} />
            <input
              type="hidden"
              name="first_installment"
              value={service?.first_installment ?? ""}
            />
            <input type="hidden" name="first_trigger" value={service?.first_trigger ?? ""} />
            <input type="hidden" name="second_trigger" value={service?.second_trigger ?? ""} />
          </>
        )}
      </SubSection>

      {/* SHORT COPY (always visible) -------------------------------------- */}
      <SubSection label="Summary">
        <Field label="Short description" hint="Optional — shown in lists and the quote.">
          <Input
            name="short_description"
            defaultValue={service?.short_description ?? ""}
            placeholder="One line clients will see in the quote"
          />
        </Field>
        <Field label="Typical timeline">
          <Input
            name="timeline_typical"
            defaultValue={service?.timeline_typical ?? ""}
            placeholder="10-20 working days, subject to MCA processing"
          />
        </Field>
      </SubSection>

      {/* ADVANCED-ONLY SECTIONS ------------------------------------------- */}
      {tab === "advanced" ? (
        <>
          <SubSection label="Scope & content">
            <Field label="Service note" hint="Shows inside the quotation.">
              <RichTextTextarea
                className="min-h-24"
                name="full_description"
                defaultValue={service?.full_description ?? ""}
                placeholder="Important note about scope, process, or timeline context."
              />
            </Field>
            <Field label="Inclusions">
              <RichTextTextarea
                className="min-h-24"
                name="inclusions"
                defaultValue={service?.inclusions ?? ""}
                placeholder="What is included"
              />
            </Field>
            <Field label="What is not included">
              <RichTextTextarea
                className="min-h-24"
                name="not_included"
                defaultValue={service?.not_included ?? ""}
                placeholder="Honest scope boundaries"
              />
            </Field>
            <Field label="Required documents" hint="Bold, Italic, Heading, Bullet, Numbered.">
              <RichTextTextarea
                className="min-h-24"
                name="required_documents"
                defaultValue={service?.required_documents ?? ""}
                tools={["bold", "italic", "heading", "bullet", "number"]}
                placeholder={"# Directors\nPAN copy\nAadhaar\n\n# Company\nBank statement"}
              />
            </Field>
          </SubSection>

          <SubSection label="Reusable document templates">
            <DocumentTemplateCheckboxes
              documentTemplates={documentTemplates}
              selectedIds={service?.document_template_ids ?? []}
            />
          </SubSection>

          <SubSection label="Flags">
            <div className="grid gap-2">
              <Toggle
                name="include_government_fees_clause"
                label="Government fees shall be extra"
                defaultChecked={hasGovFees}
              />
              <Toggle
                name="include_out_of_pocket_clause"
                label="Out-of-pocket expenditure shall be extra"
                defaultChecked={hasOOP}
              />
              <Toggle
                name="state_variations_apply"
                label="State surcharge applies"
                defaultChecked={service?.state_variations_apply ?? false}
              />
              <Toggle
                name="is_addon_template"
                label="Can be used as add-on template"
                defaultChecked={service?.is_addon_template ?? false}
              />
              <Toggle name="active" label="Active" defaultChecked={service?.active ?? true} />
            </div>
          </SubSection>

          <SubSection label="Internal notes">
            <RichTextTextarea
              className="min-h-24"
              name="internal_notes"
              defaultValue={service?.internal_notes ?? ""}
              placeholder="Visible only to your team"
            />
          </SubSection>
        </>
      ) : (
        // Quick-Add hidden defaults so the server action receives the full
        // payload. These mirror existing values (or sensible defaults on create).
        <>
          <input type="hidden" name="full_description" value={service?.full_description ?? ""} />
          <input type="hidden" name="inclusions" value={service?.inclusions ?? ""} />
          <input type="hidden" name="not_included" value={service?.not_included ?? ""} />
          <input type="hidden" name="required_documents" value={service?.required_documents ?? ""} />
          <input type="hidden" name="internal_notes" value={service?.internal_notes ?? ""} />
          {(service?.document_template_ids ?? []).map((id) => (
            <input key={id} type="hidden" name="document_template_ids" value={id} />
          ))}
          <input
            type="hidden"
            name="include_government_fees_clause"
            value={hasGovFees ? "true" : ""}
          />
          <input type="hidden" name="include_out_of_pocket_clause" value={hasOOP ? "true" : ""} />
          <input
            type="hidden"
            name="state_variations_apply"
            value={service?.state_variations_apply ? "true" : ""}
          />
          <input
            type="hidden"
            name="is_addon_template"
            value={service?.is_addon_template ? "true" : ""}
          />
          <input
            type="hidden"
            name="active"
            value={service ? (service.active ? "true" : "") : "true"}
          />
        </>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t border-[#e6ebdc] bg-white px-5 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {tab === "quick" ? (
            <button
              type="button"
              onClick={() => setTab("advanced")}
              className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-[#6a912f] hover:underline"
            >
              Advanced
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTab("quick")}
              className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-neutral-500 hover:underline"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
              Back to Quick Add
            </button>
          )}
          <Button type="submit">{isEdit ? "Save changes" : "Save service"}</Button>
        </div>
      </div>
    </form>
  );
}

function Tabs({
  tab,
  onChange,
  items
}: {
  tab: string;
  onChange: (next: "quick" | "advanced") => void;
  items: { value: "quick" | "advanced"; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-[#d9ded1] bg-white p-1 text-sm">
      {items.map((item) => {
        const active = item.value === tab;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "min-w-24 rounded px-3 py-1.5 font-bold transition",
              active ? "bg-[#a0ce4e] text-black" : "text-neutral-600 hover:bg-[#eef2e6]"
            )}
            aria-pressed={active}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-md border border-[#e6ebdc] bg-white p-4">
      <legend className="px-1 text-[11px] font-black uppercase tracking-wide text-neutral-500">{label}</legend>
      {children}
    </fieldset>
  );
}

function Toggle({
  name,
  label,
  defaultChecked
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-9 items-center gap-3 text-sm font-semibold text-neutral-700">
      <input name={name} type="checkbox" value="true" defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}
