"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import {
  dripCampaignTypes,
  dripTemplateCategories,
  dripTriggerTypes,
  dripVariableCatalog,
  renderDripTemplate,
  type DripStepInput
} from "@/lib/drips";

type ServiceOption = {
  id: string;
  name: string;
  category: string;
};

const defaultSteps: DripStepInput[] = [
  {
    step_order: 1,
    delay_amount: 0,
    delay_unit: "days",
    channel: "both",
    subject: "Quick follow-up on your quotation",
    message:
      "Hi {{lead_name}},\n\nSharing a quick follow-up on quotation {{quotation_number}} for {{selected_service}}. If you want, I can help you decide between prepaid and postpaid based on your situation.",
    whatsapp_template_key: "quote_followup_opened",
    whatsapp_template_status: "approved",
    whatsapp_preview_text:
      "Hi {{lead_name}}, quick follow-up on quotation {{quotation_number}} for {{selected_service}}. If you want, I can help you decide between prepaid and postpaid."
  },
  {
    step_order: 2,
    delay_amount: 2,
    delay_unit: "days",
    channel: "both",
    subject: "Anything you want me to clarify?",
    message:
      "Hi {{lead_name}},\n\nJust checking if you want me to clarify anything in quotation {{quotation_number}}. If documents are the only blocker, we can start with the basics and guide the rest.",
    whatsapp_template_key: "quote_followup_unopened",
    whatsapp_template_status: "approved",
    whatsapp_preview_text:
      "Hi {{lead_name}}, just checking if you want me to clarify anything in quotation {{quotation_number}}. We can start with the basics and guide the rest."
  },
  {
    step_order: 3,
    delay_amount: 5,
    delay_unit: "days",
    channel: "email",
    subject: "Happy to keep this simple",
    message:
      "Hi {{lead_name}},\n\nIf you are still deciding, that is completely fine. We can keep the process simple and move only when you are comfortable."
  }
];

export function DripCampaignBuilder({
  services,
  action
}: {
  services: ServiceOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState<(typeof dripCampaignTypes)[number]["value"]>("service_based");
  const [triggerType, setTriggerType] = useState<(typeof dripTriggerTypes)[number]["value"]>("quote_sent");
  const [channel, setChannel] = useState<"email" | "whatsapp" | "both">("both");
  const [templateCategory, setTemplateCategory] = useState<(typeof dripTemplateCategories)[number]>("Quotation follow-up");
  const [approvalStatus, setApprovalStatus] = useState<"draft" | "approved" | "needs_review">("draft");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<DripStepInput[]>(defaultSteps);
  const groupedServices = useMemo(() => groupServices(services), [services]);
  const selectedServiceSummary = useMemo(() => {
    const names = services.filter((service) => selectedServiceIds.includes(service.id)).map((service) => service.name);
    return names.length ? names.join(", ") : "Private Limited Registration";
  }, [selectedServiceIds, services]);
  const previewContext = useMemo(
    () => ({
      clientName: "Mayank Agarwal",
      companyName: "Mayank Ventures",
      quoteNumber: "Q-2026-0001",
      selectedService: selectedServiceSummary,
      quoteAmount: 18999,
      salespersonName: "Team Companyji",
      validityDate: "08 May 2026",
      recommendedPlan: "Postpaid"
    }),
    [selectedServiceSummary]
  );

  function addStep() {
    setSteps((current) => [
      ...current,
      {
        step_order: current.length + 1,
        delay_amount: current.length ? current[current.length - 1]?.delay_amount + 2 : 0,
        delay_unit: "days",
        channel: "email",
        subject: "",
        message: "",
        whatsapp_template_key: "",
        whatsapp_template_status: "draft",
        whatsapp_preview_text: ""
      }
    ]);
  }

  function updateStep(index: number, patch: Partial<DripStepInput>) {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  }

  function removeStep(index: number) {
    setSteps((current) =>
      current
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({
          ...step,
          step_order: stepIndex + 1
        }))
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drip automation builder</CardTitle>
        <p className="mt-1 text-sm leading-6 text-neutral-600">
          Create service-based follow-up flows that start after a quotation is sent, or build a custom drip that the team can manually enroll for special leads.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={action} className="space-y-5">
          <input type="hidden" name="service_ids" value={JSON.stringify(selectedServiceIds)} />
          <input type="hidden" name="steps" value={JSON.stringify(steps)} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Campaign name">
              <Input
                name="name"
                placeholder="Postpaid incorporation follow-up"
                required
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
              />
            </Field>
            <Field label="Campaign type">
              <Select name="campaign_type" value={campaignType} onChange={(event) => setCampaignType(event.target.value as (typeof dripCampaignTypes)[number]["value"])}>
                {dripCampaignTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Trigger">
              <Select name="trigger_type" value={triggerType} onChange={(event) => setTriggerType(event.target.value as (typeof dripTriggerTypes)[number]["value"])}>
                {dripTriggerTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default channel">
              <Select name="channel" value={channel} onChange={(event) => setChannel(event.target.value as "email" | "whatsapp" | "both")}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <Field label="Template category">
              <Select
                name="template_category"
                value={templateCategory}
                onChange={(event) => setTemplateCategory(event.target.value as (typeof dripTemplateCategories)[number])}
              >
                {dripTemplateCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Approval status">
              <Select
                name="approval_status"
                value={approvalStatus}
                onChange={(event) => setApprovalStatus(event.target.value as "draft" | "approved" | "needs_review")}
              >
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="needs_review">Needs review</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3 rounded-lg border border-[#d9ded1] bg-[#fbfcf8] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black text-black">Services this drip watches</p>
                  <p className="text-xs text-neutral-500">Different services can trigger different follow-up flows.</p>
                </div>
                <StatusPill>{selectedServiceIds.length} selected</StatusPill>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {groupedServices.map((group) => (
                  <div key={group.category} className="rounded-md border border-[#e6ebdc] bg-white p-3">
                    <p className="text-xs font-black uppercase text-neutral-500">{group.category}</p>
                    <div className="mt-2 space-y-2">
                      {group.services.map((service) => {
                        const checked = selectedServiceIds.includes(service.id);
                        return (
                          <label key={service.id} className="flex items-start gap-2 text-sm text-neutral-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setSelectedServiceIds((current) =>
                                  event.target.checked ? [...current, service.id] : current.filter((item) => item !== service.id)
                                )
                              }
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>{service.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input name="require_all_services" type="checkbox" value="true" className="h-4 w-4" />
                Require all selected services to match this drip
              </label>
            </div>

            <div className="space-y-4 rounded-lg border border-[#d9ded1] bg-white p-4">
              <p className="font-black text-black">Rules and safety</p>
              <div className="grid gap-3">
                <Field label="Minimum quotation value">
                  <Input name="min_quote_amount" type="number" min="0" placeholder="15000" />
                </Field>
                <Field label="Maximum quotation value">
                  <Input name="max_quote_amount" type="number" min="0" placeholder="Optional" />
                </Field>
                <Field label="Inactive days trigger">
                  <Input name="inactivity_days" type="number" min="0" placeholder="30" />
                </Field>
                <Field label="Frequency cap (days)">
                  <Input name="frequency_cap_days" type="number" min="1" defaultValue="5" />
                </Field>
                <Field label="Pause after reply (hours)">
                  <Input name="pause_hours_after_reply" type="number" min="1" defaultValue="72" />
                </Field>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input name="stop_on_reply" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                  Stop or pause when lead replies
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input name="stop_on_convert" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                  Stop when quote converts
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input name="stop_on_not_interested" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                  Stop when lead is marked not interested
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <input name="dnd_respect" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                  Respect DND, opt-out, and suppression rules
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#d9ded1] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-black">Sequence steps</p>
                <p className="text-xs text-neutral-500">Build timed follow-ups after the trigger fires.</p>
              </div>
              <Button type="button" variant="ghost" onClick={addStep}>
                <Plus className="h-4 w-4" />
                Add step
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {steps.map((step, index) => (
                <div key={`step-${index}`} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-black">Step {index + 1}</p>
                    {steps.length > 1 ? (
                      <button type="button" className="text-[#b42318]" onClick={() => removeStep(index)} aria-label={`Remove step ${index + 1}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[110px_130px_160px_1fr]">
                    <Field label="Delay">
                      <Input
                        type="number"
                        min="0"
                        value={step.delay_amount}
                        onChange={(event) => updateStep(index, { delay_amount: Number(event.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Unit">
                      <Select value={step.delay_unit} onChange={(event) => updateStep(index, { delay_unit: event.target.value as DripStepInput["delay_unit"] })}>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </Select>
                    </Field>
                    <Field label="Channel">
                      <Select value={step.channel} onChange={(event) => updateStep(index, { channel: event.target.value as DripStepInput["channel"] })}>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="both">Both</option>
                      </Select>
                    </Field>
                    <Field label="Subject">
                      <Input
                        value={step.subject}
                        onChange={(event) => updateStep(index, { subject: event.target.value })}
                        placeholder={usesEmail(step.channel) ? "Email subject" : "Not used for WhatsApp-only steps"}
                      />
                    </Field>
                  </div>
                  {usesEmail(step.channel) ? (
                    <div className="mt-3">
                      <Field label="Email message">
                        <Textarea
                          className="min-h-28"
                          value={step.message}
                          onChange={(event) => updateStep(index, { message: event.target.value })}
                          placeholder="Use variables like {{lead_name}} and {{quotation_number}}"
                        />
                      </Field>
                    </div>
                  ) : null}
                  {usesWhatsapp(step.channel) ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_180px]">
                      <Field label="WhatsApp template key">
                        <Input
                          value={step.whatsapp_template_key ?? ""}
                          onChange={(event) => updateStep(index, { whatsapp_template_key: event.target.value })}
                          placeholder="quote_followup_opened"
                        />
                      </Field>
                      <Field label="Template approval">
                        <Select
                          value={step.whatsapp_template_status ?? "draft"}
                          onChange={(event) =>
                            updateStep(index, {
                              whatsapp_template_status: event.target.value as "draft" | "submitted" | "approved" | "rejected"
                            })
                          }
                        >
                          <option value="draft">Draft</option>
                          <option value="submitted">Submitted</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </Select>
                      </Field>
                      <div className="lg:col-span-2">
                        <Field label="WhatsApp preview text">
                          <Textarea
                            className="min-h-24"
                            value={step.whatsapp_preview_text ?? ""}
                            onChange={(event) => updateStep(index, { whatsapp_preview_text: event.target.value })}
                            placeholder="Short approved-template preview with variables like {{lead_name}}"
                          />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="rounded-lg border border-[#d9ded1] bg-[#fbfcf8] p-4">
                <p className="font-black text-black">Variables</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dripVariableCatalog.map((variable) => (
                    <StatusPill key={variable}>{variable}</StatusPill>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  These variables work in both subject and message fields. The preview is rendered using a sample lead and quotation.
                </p>
              </div>
              <Field label="Internal description">
                <Textarea className="min-h-24" name="description" placeholder="What makes this drip useful, who should use it, and when to pause it." />
              </Field>
            </div>

            <div className="rounded-lg border border-[#d9ded1] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-black">Campaign preview</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Sample lead: {previewContext.clientName} | {previewContext.companyName} | {previewContext.quoteNumber}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill>{getOptionLabel(dripCampaignTypes, campaignType)}</StatusPill>
                  <StatusPill>{getOptionLabel(dripTriggerTypes, triggerType)}</StatusPill>
                  <StatusPill>{channel}</StatusPill>
                  <StatusPill>{templateCategory}</StatusPill>
                  <StatusPill>{approvalStatus.replaceAll("_", " ")}</StatusPill>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                <p className="text-sm font-black text-black">{campaignName || "Untitled drip campaign"}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-600">
                  Services: {selectedServiceSummary} | Amount: ₹{previewContext.quoteAmount?.toLocaleString("en-IN")}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {steps.map((step, index) => {
                  const renderedSubject = renderDripTemplate(step.subject || campaignName || "Companyji follow-up", previewContext);
                  const renderedMessage = renderDripTemplate(step.message || "", previewContext);
                  const renderedWhatsappPreview = renderDripTemplate(step.whatsapp_preview_text || "", previewContext);
                  return (
                    <div key={`preview-step-${index}`} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-black">Step {index + 1}</p>
                        <StatusPill>{formatDelay(step)}</StatusPill>
                        <StatusPill>{step.channel}</StatusPill>
                      </div>

                      {usesEmail(step.channel) ? (
                        <div className="mt-3 rounded-md border border-[#e6ebdc] bg-white p-3">
                          <p className="text-[11px] font-black uppercase text-neutral-500">Email subject</p>
                          <p className="mt-1 text-sm font-semibold text-black">{renderedSubject || "Subject will appear here"}</p>
                        </div>
                      ) : null}

                      {usesEmail(step.channel) ? (
                        <div className="mt-3 rounded-md border border-[#e6ebdc] bg-white p-3">
                          <p className="text-[11px] font-black uppercase text-neutral-500">Email message</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                            {renderedMessage || "Email body will appear here"}
                          </p>
                        </div>
                      ) : null}

                      {usesWhatsapp(step.channel) ? (
                        <div className="mt-3 rounded-md border border-[#e6ebdc] bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] font-black uppercase text-neutral-500">WhatsApp template</p>
                            <div className="flex gap-2">
                              <StatusPill>{step.whatsapp_template_key || "No template linked"}</StatusPill>
                              <StatusPill>{(step.whatsapp_template_status ?? "draft").replaceAll("_", " ")}</StatusPill>
                            </div>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                            {renderedWhatsappPreview || "WhatsApp preview text will appear here"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <Button type="submit">Create drip campaign</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function groupServices(services: ServiceOption[]) {
  const grouped = services.reduce<Record<string, ServiceOption[]>>((groups, service) => {
    groups[service.category] = [...(groups[service.category] ?? []), service];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupServices]) => ({
      category,
      services: groupServices.sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function getOptionLabel<T extends { value: string; label: string }>(options: readonly T[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatDelay(step: Pick<DripStepInput, "delay_amount" | "delay_unit">) {
  const unit = step.delay_amount === 1 ? step.delay_unit.slice(0, -1) : step.delay_unit;
  return step.delay_amount === 0 ? "Immediately" : `After ${step.delay_amount} ${unit}`;
}

function usesEmail(stepChannel: DripStepInput["channel"]) {
  return stepChannel === "email" || stepChannel === "both";
}

function usesWhatsapp(stepChannel: DripStepInput["channel"]) {
  return stepChannel === "whatsapp" || stepChannel === "both";
}
