import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';
import { toPrismaEnums } from '../utils/enumMapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function run() {
  const filePath = path.join(__dirname, '..', 'old data', 'Attendance_export.csv');
  console.log('Reading:', filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const headers = parseCSVLine(lines[0]);
  console.log('Headers:', headers);

  // Load students map for id/admission fallback
  const students = await prisma.student.findMany({
    select: { id: true, admission_number: true }
  });
  const admToId = new Map();
  const idToAdm = new Map();
  for (const s of students) {
    if (s.admission_number) {
      admToId.set(s.admission_number.trim().toUpperCase(), s.id);
    }
    idToAdm.set(s.id, s.admission_number);
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`Starting sync for ${lines.length - 1} total rows...`);

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx]; });

      // Check if this record already exists
      const existing = await prisma.attendance.findUnique({
        where: { id: row.id },
        select: { id: true }
      });
      if (existing) {
        skipped++;
        continue;
      }

      let studentId = row.student_id ? row.student_id.trim() : '';
      let admNo = row.admission_number ? row.admission_number.trim().toUpperCase() : '';

      if (!studentId && admNo && admToId.has(admNo)) {
        studentId = admToId.get(admNo);
      } else if (studentId && !admNo && idToAdm.has(studentId)) {
        admNo = idToAdm.get(studentId);
      }

      if (!studentId) {
        skipped++;
        continue;
      }

      const termEnum = toPrismaEnums(row.term);
      const payload = {
        id: row.id,
        student_id: studentId,
        student_name: row.student_name ? row.student_name.trim() : null,
        admission_number: admNo || null,
        class: row.class || '',
        section: (row.section === 'Primary' || row.section === 'Secondary' || row.section === 'Nursery') ? row.section : null,
        term: termEnum,
        session: row.session || '',
        date: row.date || null,
        status: row.status || 'Present',
        remarks: row.remarks || null,
        marked_by: row.marked_by || row.recorded_by || null,
        created_date: row.created_date ? new Date(row.created_date) : new Date(),
        updated_date: row.updated_date ? new Date(row.updated_date) : new Date(),
      };

      await prisma.attendance.upsert({
        where: { id: row.id },
        update: payload,
        create: payload,
      });

      imported++;
      if (imported % 200 === 0) {
        console.log(`Progress: ${imported} rows upserted...`);
      }
    } catch (e) {
      errors++;
      if (errors <= 5) {
        console.error(`Row ${i} error:`, e.message);
      }
    }
  }

  console.log(`Done! Imported/Upserted: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
  const finalCount = await prisma.attendance.count();
  console.log('Total attendance records in database now:', finalCount);
}

run().catch(console.error).finally(() => prisma.$disconnect());
