import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { toPrismaEnums } from "../utils/enumMapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. Seed School Settings
  const existingSettings = await prisma.schoolSettings.findFirst();
  if (!existingSettings) {
    const rawSettings = {
      school_name: "Milton College of Arts and Science, Kaduna",
      motto: "Knowledge, Character and Excellence",
      phone: "+234 803 000 0000",
      email: "info@miltoncollege.edu.ng",
      address: "Milton College Road, Opp. Refinery Junction, Mahuta, Kaduna",
      current_session: "2025/2026",
      current_term: "First Term",
      about:
        "Milton College is a premier co-educational institution committed to academic excellence and moral integrity.",
    };

    const settings = await prisma.schoolSettings.create({
      data: toPrismaEnums(rawSettings),
    });
    console.log("✅ Created default SchoolSettings:", settings.school_name);
  } else {
    console.log("ℹ️ SchoolSettings already exist.");
  }

  // 2. Seed Default Admin User
  const adminEmail = "admin@miltoncollege.edu.ng";
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("Admin@123456", 12);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        first_name: "Super",
        last_name: "Admin",
        role: "admin",
      },
    });
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminEmail,
        password: hashedPassword,
        role: "admin",
        first_name: "Super",
        last_name: "Admin",
        profile_type: "AdminUser",
        profile_id: admin.id,
      },
    });
    console.log(
      `✅ Created default AdminUser: ${admin.email} (Password: Admin@123456)`,
    );
  } else {
    console.log("ℹ️ Default AdminUser already exists.");
  }

  // 3. Seed Sample Subjects if empty
  const subjectCount = await prisma.subject.count();
  if (subjectCount === 0) {
    const defaultSubjects = [
      { name: "Mathematics", code: "MTH", section: "Secondary", class: "SS 1" },
      {
        name: "English Language",
        code: "ENG",
        section: "Secondary",
        class: "SS 1",
      },
      { name: "Physics", code: "PHY", section: "Secondary", class: "SS 1" },
      { name: "Chemistry", code: "CHM", section: "Secondary", class: "SS 1" },
      { name: "Biology", code: "BIO", section: "Secondary", class: "SS 1" },
      {
        name: "Basic Science",
        code: "BSC",
        section: "Primary",
        class: "Primary 5",
      },
      {
        name: "Quantitative Reasoning",
        code: "QR",
        section: "Primary",
        class: "Primary 5",
      },
    ];
    for (const sub of defaultSubjects) {
      await prisma.subject.create({ data: toPrismaEnums(sub) });
    }
    console.log(`✅ Created ${defaultSubjects.length} sample subjects.`);
  }

  console.log("🎉 Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
