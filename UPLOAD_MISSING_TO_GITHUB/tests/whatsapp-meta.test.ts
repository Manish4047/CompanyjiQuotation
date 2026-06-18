import { describe, expect, it } from "vitest";
import { extractIncomingWhatsappMessages, extractWhatsappStatusUpdates, formatWhatsappRecipient } from "@/lib/whatsapp/meta";

describe("whatsapp meta helpers", () => {
  it("formats Indian recipients for Cloud API", () => {
    expect(formatWhatsappRecipient("9876543210")).toBe("919876543210");
    expect(formatWhatsappRecipient("+91 98765 43210")).toBe("919876543210");
    expect(formatWhatsappRecipient("09876543210")).toBe("919876543210");
  });

  it("extracts inbound text messages from webhook payloads", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Raju Roy" }, wa_id: "919876543210" }],
                messages: [
                  {
                    from: "919876543210",
                    id: "wamid.HBgM123",
                    text: { body: "Need quotation" },
                    timestamp: "1711111111",
                    type: "text"
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    expect(extractIncomingWhatsappMessages(payload)).toEqual([
      {
        contactName: "Raju Roy",
        from: "919876543210",
        localPhone: "9876543210",
        messageId: "wamid.HBgM123",
        raw: {
          from: "919876543210",
          id: "wamid.HBgM123",
          text: { body: "Need quotation" },
          timestamp: "1711111111",
          type: "text"
        },
        text: "Need quotation",
        timestamp: "1711111111",
        type: "text",
        waId: "919876543210"
      }
    ]);
  });

  it("extracts delivery status updates", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.HBgM123",
                    recipient_id: "919876543210",
                    status: "delivered",
                    timestamp: "1711112222"
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    expect(extractWhatsappStatusUpdates(payload)).toEqual([
      {
        errorText: null,
        providerMessageId: "wamid.HBgM123",
        raw: {
          id: "wamid.HBgM123",
          recipient_id: "919876543210",
          status: "delivered",
          timestamp: "1711112222"
        },
        recipientWaId: "919876543210",
        status: "delivered",
        timestamp: "1711112222"
      }
    ]);
  });
});
