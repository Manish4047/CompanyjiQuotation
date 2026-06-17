import "server-only";

type SendBrevoEmailInput = {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
};

type BrevoSendResponse = {
  messageId?: string;
};

export async function sendBrevoEmail(input: SendBrevoEmailInput) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.QUOTE_FROM_EMAIL || process.env.BREVO_SENDER_EMAIL || "roc@onlinesbs.in";
  const senderName =
    process.env.QUOTE_FROM_NAME ||
    process.env.BREVO_SENDER_NAME ||
    "Smart Business Solutions - Companyji";
  const replyToEmail = process.env.QUOTE_REPLY_TO_EMAIL || senderEmail;
  const bccEmail = process.env.QUOTE_BCC_EMAIL || "roc@onlinesbs.in";

  if (!apiKey) {
    throw new Error("Brevo is not configured. Add BREVO_API_KEY in your environment variables.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: input.toEmail,
          name: input.toName || input.toEmail
        }
      ],
      bcc: bccEmail
        ? [
            {
              email: bccEmail,
              name: "Companyji copy"
            }
          ]
        : undefined,
      replyTo: {
        email: replyToEmail,
        name: senderName
      },
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      tags: input.tags
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo could not send the email: ${responseText || response.statusText}`);
  }

  return responseText ? (JSON.parse(responseText) as BrevoSendResponse) : {};
}
