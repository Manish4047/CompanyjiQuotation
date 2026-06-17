import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { RichTextTextarea } from "@/components/ui/rich-text-textarea";
import { createService } from "@/app/(app)/services/actions";
import { defaultCurrencyCode, supportedCurrencyOptions } from "@/lib/currency";
import { retainershipCycles } from "@/lib/service-pricing";

export type ServiceDocumentTemplateOption = {
  id: string;
  name: string;
  category: string;
};

export function ServiceCreateForm({ documentTemplates }: { documentTemplates: ServiceDocumentTemplateOption[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Add service</CardTitle>
        <p className="mt-1 text-sm text-neutral-500">
          Add every service once. Quotes will pull pricing, documents, inclusions, and timelines from here.
        </p>
      </CardHeader>
      <CardContent>
        <form action={createService} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Service code">
              <Input name="code" placeholder="Leave blank to auto-generate" />
            </Field>
            <Field label="Service name">
              <Input name="name" placeholder="Private Limited Registration" required />
            </Field>
            <Field label="Category">
              <Input name="category" placeholder="Incorporation" required />
            </Field>
            <Field label="Pricing mode">
              <Select name="pricing_mode" defaultValue="fixed">
                <option value="fixed">Fixed</option>
                <option value="engagement_based">Engagement based</option>
                <option value="retainership">Retainership</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select name="currency_code" defaultValue={defaultCurrencyCode}>
                {supportedCurrencyOptions.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prepaid fee" hint="Used for one-time fixed quotes.">
              <Input name="prepaid_fee" type="number" min="0" defaultValue="0" />
            </Field>
            <Field label="Postpaid fee" hint="Used for one-time milestone quotes.">
              <Input name="postpaid_fee" type="number" min="0" defaultValue="0" />
            </Field>
            <Field label="Retainership fee" hint="Used when pricing mode is Retainership.">
              <Input name="retainership_fee" type="number" min="0" defaultValue="0" />
            </Field>
            <Field label="Retainership billing cycle">
              <Select name="retainership_cycle" defaultValue="monthly">
                {retainershipCycles.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prepaid description">
              <Input name="prepaid_description" defaultValue="Full payment upfront. Work begins after payment confirms." />
            </Field>
            <Field label="Postpaid description">
              <Input name="postpaid_description" defaultValue="No advance. Payment is due after the agreed milestone." />
            </Field>
            <Field label="In case of Postpaid - first installment">
              <Input name="first_installment" type="number" min="0" placeholder="4999" />
            </Field>
            <Field label="In case of Postpaid - first installment trigger">
              <Input name="first_trigger" placeholder="After DSC is applied" />
            </Field>
            <Field label="In case of Postpaid - second installment trigger">
              <Input name="second_trigger" placeholder="After Incorporation Certificate is issued" />
            </Field>
          </div>

          <Field label="Short description">
            <Input name="short_description" placeholder="One line shown in the quote" />
          </Field>
          <Field label="Service note" hint="Use the toolbar for bold, italic, headings, and bullet points. This shows inside the quotation.">
            <RichTextTextarea className="min-h-20" name="full_description" placeholder="Important note about this service, scope, timeline context, or process." />
          </Field>
          <Field label="Timeline">
            <Input name="timeline_typical" placeholder="10-20 working days, subject to MCA processing" />
          </Field>
          <Field label="Inclusions" hint="Formatting is preserved in the quote preview, PDF, and email.">
            <RichTextTextarea className="min-h-20" name="inclusions" placeholder="What is included in this service" />
          </Field>
          <Field label="What is not included" hint="Use this when you need crisp scope boundaries.">
            <RichTextTextarea className="min-h-20" name="not_included" placeholder="Honest scope boundaries" />
          </Field>
          <Field label="Required documents" hint="Use Bold, Italic, Heading, Bullet, and Numbered here. Blank lines stay blank in the quote.">
            <RichTextTextarea
              className="min-h-20"
              name="required_documents"
              tools={["bold", "italic", "heading", "bullet", "number"]}
              placeholder={"# Directors\nPAN copy\nAadhaar\n\n# Company\nBank statement"}
            />
          </Field>
          <DocumentTemplateCheckboxes documentTemplates={documentTemplates} selectedIds={[]} />
          <div className="grid gap-2 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
              <input name="include_government_fees_clause" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
              Government fees shall be extra
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
              <input name="include_out_of_pocket_clause" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
              Out-of-pocket expenditure shall be extra
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
              <input name="state_variations_apply" type="checkbox" value="true" className="h-4 w-4" />
              State surcharge applies
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
              <input name="is_addon_template" type="checkbox" value="true" className="h-4 w-4" />
              Can be used as add-on template
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
              <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
              Active
            </label>
          </div>

          <Button type="submit">Save service</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function DocumentTemplateCheckboxes({
  documentTemplates,
  selectedIds
}: {
  documentTemplates: ServiceDocumentTemplateOption[];
  selectedIds: string[];
}) {
  if (!documentTemplates.length) {
    return (
      <div className="rounded-md border border-dashed border-[#d9ded1] p-4 text-sm text-neutral-500">
        No document templates yet. Add them from Documents, or use the free-text document box above.
      </div>
    );
  }

  const groupedDocuments = groupDocumentTemplates(documentTemplates);
  const selectedCount = selectedIds.length;

  return (
    <div className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8]">
      <div className="flex items-center justify-between gap-3 border-b border-[#e6ebdc] px-3 py-2">
        <div>
          <p className="text-sm font-black text-black">Reusable documents</p>
          <p className="text-xs font-normal text-neutral-500">Grouped by category. Selected documents can still be changed in the quote.</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-neutral-600">{selectedCount} selected</span>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        {groupedDocuments.map((group) => (
          <details key={group.category} className="mb-2 rounded-md border border-[#d9ded1] bg-white last:mb-0" open={group.documents.some((document) => selectedIds.includes(document.id))}>
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-black text-black">
              <span>{group.category}</span>
              <span className="text-neutral-500">{group.documents.length}</span>
            </summary>
            <div className="grid gap-1 border-t border-[#e6ebdc] p-2 sm:grid-cols-2">
              {group.documents.map((document) => (
                <label key={document.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-semibold text-neutral-700 hover:bg-[#f4f4f4]">
                  <input
                    name="document_template_ids"
                    type="checkbox"
                    value={document.id}
                    defaultChecked={selectedIds.includes(document.id)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{document.name}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function groupDocumentTemplates(documentTemplates: ServiceDocumentTemplateOption[]) {
  const grouped = documentTemplates.reduce<Record<string, ServiceDocumentTemplateOption[]>>((groups, document) => {
    groups[document.category] = [...(groups[document.category] ?? []), document];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, documents]) => ({ category, documents }));
}
