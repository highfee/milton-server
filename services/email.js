import nodemailer from "nodemailer";

let etherealTransporter = null;

function getEtherealTransporter() {
  if (etherealTransporter) return etherealTransporter;
  console.warn("[Email] RESEND_API_KEY not set — using Ethereal dev transport");
  etherealTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER || "ethereal_user@ethereal.email",
      pass: process.env.ETHEREAL_PASS || "ethereal_pass",
    },
  });
  return etherealTransporter;
}

/**
 * sendEmail — Send an email using Resend HTTPS API (or Ethereal fallback).
 *
 * @param {object} options
 * @param {string|string[]} options.to       - Recipient email
 * @param {string}          options.subject  - Email subject
 * @param {string}          options.text     - Plain text body
 * @param {string}          [options.html]   - HTML body (optional)
 * @param {string}          [options.from]   - Override from address
 * @returns {Promise<object>} Result
 */
export async function sendEmail({ to, subject, text, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toList = Array.isArray(to) ? to : [to];

  // Default from address: if not provided and not in env, use Resend default sandbox sender
  const fromAddress =
    from ||
    process.env.EMAIL_FROM ||
    "Milton College <onboarding@resend.dev>";

  if (apiKey) {
    // Send via Resend HTTPS REST API (Port 443 — immune to cloud SMTP port blocks on Render/AWS/Vercel)
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: toList,
          subject,
          text,
          ...(html ? { html } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[Email/Resend API Error]", data);
        throw new Error(data.message || `Resend API Error: ${response.statusText}`);
      }

      console.log(`[Email/Resend] Sent to ${toList.join(", ")} | Subject: ${subject} | ID: ${data.id}`);
      return { success: true, messageId: data.id, ...data };
    } catch (err) {
      console.error("[Email/Resend Failed]", err.message);
      throw err;
    }
  }

  // Fallback: Ethereal transport
  const t = getEtherealTransporter();
  const info = await t.sendMail({
    from: fromAddress,
    to: toList.join(", "),
    subject,
    text,
    ...(html ? { html } : {}),
  });

  console.log(`[Email/Ethereal] Sent to ${toList.join(", ")} | Subject: ${subject} | MessageId: ${info.messageId}`);
  return info;
}
