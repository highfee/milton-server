import { Router } from 'express';
import prisma from '../../config/prisma.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { sendEmail } from '../../services/email.js';

const router = Router();

/**
 * POST /api/functions/sendAdmissionOfferEmail
 * Requires admin role JWT.
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { application_id } = req.body;

    if (!application_id) {
      return res.status(400).json({ error: 'application_id is required' });
    }

    const app = await prisma.admissionApplication.findUnique({ where: { id: application_id } });

    if (!app || !app.parent_email) {
      return res.status(404).json({ error: 'Application not found or no parent email' });
    }

    const applicantName = `${app.first_name} ${app.last_name}`.trim();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const responseUrl = `${baseUrl}/api/functions/handleAdmissionResponse`;
    const acceptLink = `${responseUrl}?app=${application_id}&action=accept`;
    const rejectLink = `${responseUrl}?app=${application_id}&action=reject`;

    const tuitionLine = app.tuition_fee ? `Tuition Fee: N${Number(app.tuition_fee).toLocaleString()}\n` : '';
    const resumeLine = app.resumption_date ? `Resumption Date: ${app.resumption_date}\n` : '';

    const message = `Dear ${app.parent_name},

CONGRATULATIONS!

We are pleased to inform you that ${applicantName} has been offered provisional admission into ${app.section_applying} section, Class: ${app.final_class_admitted || app.class_applying} at Milton College of Arts and Science, Kaduna.

Admission Number: ${app.admission_number_generated || 'To be assigned'}
${tuitionLine}${resumeLine}
To proceed, please choose one of the options below:

ACCEPT ADMISSION:
${acceptLink}

REJECT ADMISSION:
${rejectLink}

If you accept, an acceptance letter (PDF) will be sent to your email immediately. Please print the acceptance letter and bring it to the school.

This offer is valid for 14 days. If you do not respond within this period, the offer may be withdrawn.

For enquiries, please contact the school.

Warm regards,
Admissions Office
Milton College of Arts and Science, Kaduna`;

    await sendEmail({
      to: app.parent_email,
      subject: `Admission Offer — ${applicantName} | Milton College`,
      text: message,
    });

    return res.json({ success: true, message: 'Admission offer email sent' });
  } catch (error) {
    console.error('[sendAdmissionOfferEmail]', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
