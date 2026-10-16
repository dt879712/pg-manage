import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return Boolean(env.brevoApiKey || (env.smtpHost && env.smtpUser && env.smtpPass));
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
      // Fail fast: some hosts (e.g. Render free) block SMTP ports, and the
      // default 2-minute timeout makes reset requests hang.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Splits "Name <user@host>" into { name, email }. */
function parseFrom(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: value.trim() };
}

async function sendViaBrevoApi(options: MailOptions): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.brevoApiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: parseFrom(env.mailFrom),
      to: [{ email: options.to }],
      subject: options.subject,
      textContent: options.text,
      htmlContent: options.html ?? `<p>${options.text}</p>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
}

/** Sends an email via the Brevo API (preferred) or the configured SMTP provider. */
export async function sendMail(options: MailOptions): Promise<void> {
  if (env.brevoApiKey) {
    await sendViaBrevoApi(options);
    return;
  }
  await getTransporter().sendMail({ from: env.mailFrom, ...options });
}
