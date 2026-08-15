import { Router } from 'express';
import { jsPDF } from 'jspdf';
import prisma from '../../config/prisma.js';
import { sendEmail } from '../../services/email.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const appId = req.query.app;
    const action = req.query.action;

    if (!appId || !action) {
      return res.status(400).send(generateHTML('Error', 'Invalid request. Please use the links from your admission offer email.'));
    }

    const app = await prisma.admissionApplication.findUnique({ where: { id: appId } });

    if (!app) {
      return res.status(404).send(generateHTML('Error', 'Application not found. Please contact the school.'));
    }

    const applicantName = `${app.first_name} ${app.last_name}`.trim();

    // --- REJECT ---
    if (action === 'reject') {
      if (app.status !== 'Offered_Admission' && app.status !== 'Offered Admission') {
        return res.send(generateHTML('Already Processed', `This application has already been processed (status: ${app.status}). If you believe this is an error, please contact the school.`));
      }
      await prisma.admissionApplication.update({
        where: { id: appId },
        data: { status: 'Rejected' },
      });
      return res.send(generateHTML('Admission Declined', `You have declined the admission offer for ${applicantName}. If you change your mind, please contact the school admissions office.`));
    }

    // --- DOWNLOAD PDF ---
    if (action === 'download') {
      if (app.status !== 'Accepted') {
        return res.send(generateHTML('Error', 'Acceptance letter is only available after accepting the admission offer.'));
      }
      const pdfBuffer = generateAcceptanceLetterPDF({
        candidateName: applicantName,
        admissionNumber: app.admission_number_generated || '',
        classAdmitted: app.final_class_admitted || app.class_applying || '',
        section: app.section_applying || '',
        parentName: app.parent_name || '',
        date: new Date().toISOString().split('T')[0],
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="acceptance-letter-${app.application_number || appId}.pdf"`);
      return res.send(Buffer.from(pdfBuffer));
    }

    // --- ACCEPT ---
    if (action === 'accept') {
      if (app.status !== 'Offered_Admission' && app.status !== 'Offered Admission') {
        return res.send(generateHTML('Already Processed', `This application has already been processed (status: ${app.status}). If you believe this is an error, please contact the school.`));
      }

      await prisma.admissionApplication.update({
        where: { id: appId },
        data: { status: 'Accepted' },
      });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const downloadLink = `${baseUrl}/api/functions/handleAdmissionResponse?app=${appId}&action=download`;

      const emailMessage = `Dear ${app.parent_name},

Your admission acceptance has been confirmed!

${applicantName} has been officially accepted into ${app.section_applying} section, Class: ${app.final_class_admitted || app.class_applying} at Milton College of Arts and Science, Kaduna.

Admission Number: ${app.admission_number_generated || 'To be assigned'}

Your Acceptance Letter (PDF) is available for download at:
${downloadLink}

IMPORTANT INSTRUCTIONS:
1. Download and print the acceptance letter.
2. Bring the printed copy to the school on or before the resumption date.
${app.resumption_date ? `3. Resumption Date: ${app.resumption_date}` : ''}
${app.tuition_fee ? `4. Tuition Fee: N${Number(app.tuition_fee).toLocaleString()}` : ''}

We look forward to welcoming ${applicantName} to Milton College!

Warm regards,
Admissions Office
Milton College of Arts and Science, Kaduna`;

      try {
        await sendEmail({
          to: app.parent_email,
          subject: `Acceptance Letter — ${applicantName} | Milton College`,
          text: emailMessage,
        });
      } catch (emailErr) {
        console.error('[handleAdmissionResponse] email failed:', emailErr);
      }

      return res.send(generateAcceptHTML(applicantName, downloadLink));
    }

    return res.send(generateHTML('Error', 'Unknown action. Please use the links from your admission offer email.'));
  } catch (error) {
    console.error('[handleAdmissionResponse]', error);
    return res.status(500).send(generateHTML('Error', error.message));
  }
});

function generateHTML(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Milton College</title><style>body{font-family:Arial,sans-serif;background:#f0f4f8;margin:0;padding:20px}.container{max-width:500px;margin:40px auto;background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1)}h1{color:#1e3a5f}p{color:#555;line-height:1.6}</style></head><body><div class="container"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function generateAcceptHTML(applicantName, downloadLink) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admission Accepted — Milton College</title><style>body{font-family:Arial,sans-serif;background:#f0f4f8;margin:0;padding:20px}.container{max-width:500px;margin:40px auto;background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1)}.check{width:80px;height:80px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:40px}h1{color:#1e3a5f}p{color:#555;line-height:1.6}.btn{display:inline-block;padding:14px 36px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:8px;margin-top:20px;font-weight:700}.note{background:#fef3c7;padding:12px;border-radius:8px;margin-top:16px;font-size:14px;color:#92400e}</style></head><body><div class="container"><div class="check">\u2705</div><h1>Admission Accepted!</h1><p>Congratulations! ${applicantName}'s admission has been accepted successfully.</p><p>A copy of the acceptance letter has been sent to your email.</p><a href="${downloadLink}" class="btn">Download Acceptance Letter (PDF)</a><div class="note">Please print the acceptance letter and bring it to the school on resumption.</div></div></body></html>`;
}

function generateAcceptanceLetterPDF(data) {
  const { candidateName, admissionNumber, classAdmitted, section, parentName, date } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const M = 15;
  const CW = 210 - M * 2;
  let y = 18;

  doc.setDrawColor(255, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(5, 5, 200, 287);

  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(178, 34, 34);
  doc.text('MILTON COLLEGE OF ARTS AND SCIENCE', 105, y, { align: 'center' });
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 255);
  doc.text('(DAY AND BOARDING)', 105, y, { align: 'center' });
  y += 5;
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('P. O. Box 1558, Kaduna.', M, y);
  doc.text('Milton College Road, Opp. Refinery Junction, Mahuta, Kaduna.', 210 - M, y, { align: 'right' });

  y += 8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, y, 210 - M, y);
  y += 10;

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('ACCEPTANCE OF ADMISSION', 105, y, { align: 'center' });
  y += 4;
  const tw = doc.getTextWidth('ACCEPTANCE OF ADMISSION');
  doc.line(105 - tw / 2, y, 105 + tw / 2, y);
  y += 10;

  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${date}`, 210 - M, y, { align: 'right' });
  y += 8;

  const body1 = `I, ${parentName || '___________________'}, parent/guardian of ${candidateName || '___________________'}, hereby formally accept the offer of provisional admission into ${section || '_____'} section, Class: ${classAdmitted || '___________'} at Milton College of Arts and Science, Kaduna.`;
  y = addWrappedText(doc, body1, M, y, CW, 5);
  y += 3;

  const body2 = `Admission Number: ${admissionNumber || '___________________'} was assigned to the candidate.`;
  y = addWrappedText(doc, body2, M, y, CW, 5);
  y += 5;

  y = addWrappedText(doc, 'I confirm that:', M, y, CW, 5);
  y += 2;

  const confirmations = [
    '1.  All information provided in the application form is true and correct.',
    '2.  I have read and understood the school\u2019s rules and regulations.',
    '3.  I agree to pay all required fees as stipulated by the school.',
    '4.  I will ensure my child/ward adheres to the school\u2019s code of conduct.',
    '5.  I will provide all required documents and materials as requested.'
  ];
  confirmations.forEach(c => {
    y = addWrappedText(doc, c, M + 2, y, CW - 2, 5);
    y += 1;
  });

  y += 8;
  y = addWrappedText(doc, 'I look forward to a fruitful and rewarding academic journey for my child/ward at Milton College of Arts and Science, Kaduna.', M, y, CW, 5);
  y += 10;

  doc.line(M, y, M + 65, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('Parent/Guardian Signature', M, y + 5);
  doc.text(`Name: ${parentName || ''}`, M, y + 10);

  doc.line(210 - M - 65, y, 210 - M, y);
  doc.text('For: Management', 210 - M - 65, y + 5);
  doc.text('Milton College of Arts and Science', 210 - M - 65, y + 10);

  return doc.output('arraybuffer');
}

function addWrappedText(doc, text, x, y, maxWidth, lineH) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

export default router;
