export type NotifierProvider = "resend" | "smtp2go";

export type NotifierConfig = {
  provider: NotifierProvider;
  apiKey: string;
  from: string;
  to: string;
};

export type EmailMessage = {
  subject: string;
  body: string;
};

function parseRecipients(to: string): string[] {
  return to.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function sendFailureEmail(
  config: NotifierConfig,
  msg: EmailMessage
): Promise<void> {
  const recipients = parseRecipients(config.to);
  const { url, headers, body } =
    config.provider === "resend"
      ? buildResendRequest(config, recipients, msg)
      : buildSmtp2goRequest(config, recipients, msg);

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`notifier failed: ${res.status} ${text}`);
  }
}

function buildResendRequest(
  config: NotifierConfig,
  to: string[],
  msg: EmailMessage
) {
  return {
    url: "https://api.resend.com/emails",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to,
      subject: msg.subject,
      text: msg.body,
    }),
  };
}

function buildSmtp2goRequest(
  config: NotifierConfig,
  to: string[],
  msg: EmailMessage
) {
  return {
    url: "https://api.smtp2go.com/v3/email/send",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.apiKey,
      sender: config.from,
      to,
      subject: msg.subject,
      text_body: msg.body,
    }),
  };
}
