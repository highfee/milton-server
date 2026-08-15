import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";

async function main() {
  const targetEmail = "missioncomputertrainingcentre@gmail.com";
  const rawPassword = "Admin@123";
  const hashedPassword = await bcrypt.hash(rawPassword, 12);

  console.log(`Synchronizing admin across AdminUser and User tables for: ${targetEmail}...`);

  // 1. Find or create AdminUser
  let admin = await prisma.adminUser.findFirst();
  if (admin) {
    admin = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        email: targetEmail,
        password: hashedPassword,
        first_name: "Super",
        last_name: "Admin",
        role: "admin",
      },
    });
  } else {
    admin = await prisma.adminUser.create({
      data: {
        email: targetEmail,
        password: hashedPassword,
        first_name: "Super",
        last_name: "Admin",
        role: "admin",
      },
    });
  }
  console.log("AdminUser table record:", admin);

  // 2. Remove any other stale/duplicate admin users in User table
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: "admin@miltoncollege.edu.ng" },
        { username: "admin@miltoncollege.edu.ng" },
      ],
    },
  });

  // 3. Upsert User table record
  const user = await prisma.user.upsert({
    where: { email: targetEmail },
    update: {
      username: targetEmail,
      email: targetEmail,
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
      profile_type: "AdminUser",
      profile_id: admin.id,
    },
    create: {
      email: targetEmail,
      username: targetEmail,
      password: hashedPassword,
      first_name: "Super",
      last_name: "Admin",
      role: "admin",
      profile_type: "AdminUser",
      profile_id: admin.id,
    },
  });
  console.log("User table record:", user);

  // Verify all admin records across both tables
  const allAdmins = await prisma.adminUser.findMany();
  console.log("All AdminUser records in DB:", allAdmins);

  const allAdminUsers = await prisma.user.findMany({
    where: { role: "admin" },
  });
  console.log("All User records with role='admin' in DB:", allAdminUsers);

  console.log("✅ Admin email and password completely synchronized in User and AdminUser tables!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("Error updating admin:", err);
    prisma.$disconnect();
    process.exit(1);
  });
