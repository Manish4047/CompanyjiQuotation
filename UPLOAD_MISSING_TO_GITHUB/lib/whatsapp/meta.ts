import { normalizeMobile } from "@/lib/contacts";

export type MetaWhatsappEnv = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  graphVersion: string;
  defaultCountryCode: string;
};

export type IncomingWhatsappMessage = {
  contactName: string | null;
  from: string;
  localPhone: string;
  messageId: string;
  timestamp: string | null;
  type: string;
  text: string;
  waId: string;
  raw: Record<string, unknown>;
};

export type IncomingWhatsappStatus = {
  errorText: string | null;
  providerMessageId: string;
  raw: Record<string, unknown>;
  recipientWaId: string | null;
  status: string;
  timestamp: string | null;
};

export function getMetaWhatsappEnv(): MetaWhatsappEnv | null {
  const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_META_VERIFY_TOKEN;

  if (!accessToken || !phoneNumberId || !verifyToken) return null;

  return {
    accessToken,
    phoneNumberId,
    verifyToken,
    graphVersion: process.env.WHATSAPP_META_GRAPH_VERSION || "v23.0",
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91"
  };
}

export function hasMetaWhatsappConfig() {
  return Boolean(getMetaWhatsappEnv());
}

export function formatWhatsappRecipient(value: string, defaultCountryCode = "91") {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith(defaultCountryCode) && digits.length > 10) return digits;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

export function extractIncomingWhatsappMessages(payload: unknown): IncomingWhatsappMessage[] {
  const messages: IncomingWhatsappMessage[] = [];

  for (const change of extractValueChanges(payload)) {
    const contacts = toArray<Record<string, unknown>>(change.contacts);
    const contactNameByWaId = new Map(
      contacts.map((contact) => {
        const waId = String(contact.wa_id ?? "");
        const profile = asRecord(contact.profile);
        return [waId, String(profile?.name ?? "").trim() || null] as const;
      })
    );

    for (const message of toArray<Record<string, unknown>>(change.messages)) {
      const from = String(message.from ?? "").trim();
      const waId = from;
      const text = readMessageText(message);

      messages.push({
        contactName: contactNameByWaId.get(waId) ?? null,
        from,
        localPhone: normalizeMobile(from),
        messageId: String(message.id ?? ""),
        timestamp: message.timestamp ? String(message.timestamp) : null,
        type: String(message.type ?? "text"),
        text,
        waId,
        raw: message
      });
    }
  }

  return messages.filter((message) => message.messageId && message.waId);
}

export function extractWhatsappStatusUpdates(payload: unknown): IncomingWhatsappStatus[] {
  const statuses: IncomingWhatsappStatus[] = [];

  for (const change of extractValueChanges(payload)) {
    for (const status of toArray<Record<string, unknown>>(change.statuses)) {
      const errors = toArray<Record<string, unknown>>(status.errors);
      statuses.push({
        errorText: errors.map((error) => String(error.title ?? error.message ?? "").trim()).filter(Boolean).join("; ") || null,
        providerMessageId: String(status.id ?? ""),
        raw: status,
        recipientWaId: status.recipient_id ? String(status.recipient_id) : null,
        status: String(status.status ?? ""),
        timestamp: status.timestamp ? String(status.timestamp) : null
      });
    }
  }

  return statuses.filter((status) => status.providerMessageId && status.status);
}

export async function sendMetaWhatsappTextMessage({
  body,
  to
}: {
  body: string;
  to: string;
}) {
  const env = getMetaWhatsappEnv();
  if (!env) {
    throw new Error("WhatsApp Meta Cloud API is not configured. Add WHATSAPP_META_* variables.");
  }

  const recipient = formatWhatsappRecipient(to, env.defaultCountryCode);
  if (!recipient) throw new Error("Recipient WhatsApp number is blank.");

  const response = await fetch(`https://graph.facebook.com/${env.graphVersion}/${env.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        body,
        preview_url: false
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `WhatsApp API failed with ${response.status}.`);
  }

  return (await response.json()) as {
    messages?: Array<{ id?: string }>;
    contacts?: Array<{ input?: string; wa_id?: string }>;
  };
}

function extractValueChanges(payload: unknown) {
  const root = asRecord(payload);
  const entries = toArray<Record<string, unknown>>(root?.entry);
  return entries.flatMap((entry) =>
    toArray<Record<string, unknown>>(entry.changes).flatMap((change) => {
      const value = asRecord(change.value);
      return value ? [value] : [];
    })
  );
}

function readMessageText(message: Record<string, unknown>) {
  const type = String(message.type ?? "text");

  if (type === "text") {
    return String(asRecord(message.text)?.body ?? "").trim();
  }

  if (type === "button") {
    return String(asRecord(message.button)?.text ?? "").trim();
  }

  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    const buttonReply = asRecord(interactive?.button_reply);
    const listReply = asRecord(interactive?.list_reply);
    return String(buttonReply?.title ?? listReply?.title ?? "").trim();
  }

  if (type === "image" || type === "document" || type === "video") {
    return String(asRecord(message[type])?.caption ?? "").trim() || `${type} attachment`;
  }

  return `${type} message`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}
