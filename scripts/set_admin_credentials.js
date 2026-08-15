import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";

async function main() {
  const adminEmail = "missioncomputertrainingcentre@gmail.com";
  const newPassword = "Admin@123";
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  console.log(`Setting password for admin: ${adminEmail}...`);

  // 1. Update or create AdminUser
  const adminUser = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
    },
  });
  console.log("AdminUser updated:", adminUser.id, adminUser.email);

  // 2. Update or create User table record
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      username: adminEmail,
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
      profile_type: "AdminUser",
      profile_id: adminUser.id,
    },
    create: {
      email: adminEmail,
      username: adminEmail,
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
      profile_type: "AdminUser",
      profile_id: adminUser.id,
    },
  });
  console.log("User table record updated:", user.id, user.email);

  // Also sync any other admin records
  const allAdmins = await prisma.adminUser.findMany();
  for (const a of allAdmins) {
    await prisma.adminUser.update({
      where: { id: a.id },
      data: { password: hashedPassword },
    });
  }

  console.log("✅ Admin credentials set to Admin@123 successfully!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
