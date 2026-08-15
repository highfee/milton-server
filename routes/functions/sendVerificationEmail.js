import { Router } from 'express';
import { sendEmail } from '../../services/email.js';

const router = Router();

/**
 * POST /api/functions/sendVerificationEmail
 * Public endpoint — sends admission form email verification code.
 * No auth required (applicants are not registered users).
 */
router.post('/', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    await sendEmail({
      to: email,
      subject: 'Email Verification Code — Milton College Admission',
      text: `Your email verification code is: ${code}

Enter this code on the admission form to verify your email and proceed with your application.

Milton College of Arts and Science, Kaduna`,
    });

    return res.json({ success: true, message: 'Verification email sent.' });
  } catch (err) {
    console.error('[sendVerificationEmail]', err);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
});

export default router;
