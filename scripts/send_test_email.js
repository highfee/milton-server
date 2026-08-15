import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sendEmail } from "../services/email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const to = process.argv[2] || process.env.TEST_EMAIL_TO;
  if (!to) {
    console.error(
      "Usage: node scripts/send_test_email.js recipient@example.com",
    );
    process.exit(1);
  }

  try {
    const info = await sendEmail({
      to,
      subject: "Milton College — Test Email",
      text: `This is a test email sent from Milton College portal at ${new Date().toISOString()}`,
    });
    console.log("Send result:", info);
  } catch (err) {
    console.error("Failed to send test email:", err);
    process.exit(2);
  }
}

main();
