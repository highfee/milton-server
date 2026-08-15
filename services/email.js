import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    // Use Resend SMTP — best deliverability, no exposed client-side keys
    transporter = nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      tls: {
        // Allow self-signed certs in local/dev environments when necessary.
        // This is scoped to the Resend transport only to avoid global TLS relaxation.
        rejectUnauthorized: false,
      },
      auth: {
        user: "resend",
        pass: apiKey,
      },
    });
    console.log("[Email] Using Resend SMTP transport");
  } else {
    // Fallback: Ethereal (for development — catches emails in a test inbox)
    console.warn(
      "[Email] RESEND_API_KEY not set — using Ethereal dev transport",
    );
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: process.env.ETHEREAL_USER || "ethereal_user@ethereal.email",
        pass: process.env.ETHEREAL_PASS || "ethereal_pass",
      },
    });
  }

  return transporter;
}

/**
 * sendEmail — Send an email using the configured transporter.
 *
 * @param {object} options
 * @param {string}   options.to       - Recipient email
 * @param {string}   options.subject  - Email subject
 * @param {string}   options.text     - Plain text body
 * @param {string}   [options.html]   - HTML body (optional)
 * @param {string}   [options.from]   - Override from address
 * @returns {Promise<object>} Nodemailer send result
 */
export async function sendEmail({ to, subject, text, html, from }) {
  const t = getTransporter();
  const fromAddress =
    from ||
    process.env.EMAIL_FROM ||
    "Milton College <noreply@miltoncollegeportal.com>";

  const info = await t.sendMail({
    from: fromAddress,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });

  console.log(
    `[Email] Sent to ${to} | Subject: ${subject} | MessageId: ${info.messageId}`,
  );
  return info;
}
