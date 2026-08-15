import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";
import { generateToken, authenticate } from "../middleware/auth.js";

const router = Router();

async function normalizePassword(password) {
  if (!password) return null;
  return password.startsWith("$2") ? password : await bcrypt.hash(password, 12);
}

async function syncGenericUser({
  email,
  username,
  password,
  role,
  first_name,
  last_name,
  profile_type,
  profile_id,
}) {
  const filters = [];
  if (email) filters.push({ email: email.toLowerCase() });
  if (username) filters.push({ username: username.trim() });
  if (profile_type && profile_id) filters.push({ profile_type, profile_id });

  const where = filters.length ? { OR: filters } : null;
  const existing = where ? await prisma.user.findFirst({ where }) : null;
  const hashedPassword = password
    ? await normalizePassword(password)
    : undefined;

  const data = {
    role,
    first_name,
    last_name,
    profile_type,
    profile_id,
  };
  if (email) data.email = email.toLowerCase();
  if (username) data.username = username.trim();
  if (hashedPassword) data.password = hashedPassword;

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    return existing;
  }

  return prisma.user.create({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login — Unified login across all authenticated roles
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "Identifier and password are required." });
    }

    const loginKey = identifier.trim();
    const emailKey = loginKey.toLowerCase();

    const genericUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailKey }, { username: loginKey }],
      },
    });

    if (genericUser && genericUser.password) {
      const isBcrypt = genericUser.password.startsWith("$2");
      const valid = isBcrypt
        ? await bcrypt.compare(password, genericUser.password)
        : password === genericUser.password;

      if (valid) {
        const token = generateToken({
          id: genericUser.id,
          email: genericUser.email || "",
          role: genericUser.role,
          username: genericUser.username,
          name: `${genericUser.first_name || ""} ${genericUser.last_name || ""}`.trim(),
          profile_type: genericUser.profile_type,
          profile_id: genericUser.profile_id,
        });

        return res.json({
          token,
          user: {
            id: genericUser.id,
            email: genericUser.email,
            username: genericUser.username,
            role: genericUser.role,
            first_name: genericUser.first_name,
            last_name: genericUser.last_name,
            profile_type: genericUser.profile_type,
            profile_id: genericUser.profile_id,
          },
        });
      }
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: emailKey },
    });
    if (admin) {
      const valid = await bcrypt.compare(password, admin.password);
      if (valid) {
        await syncGenericUser({
          email: admin.email,
          username: admin.email,
          password: admin.password,
          role: admin.role,
          first_name: admin.first_name,
          last_name: admin.last_name,
          profile_type: "AdminUser",
          profile_id: admin.id,
        });

        const token = generateToken({
          id: admin.id,
          email: admin.email,
          role: admin.role,
          username: admin.email,
          name: `${admin.first_name} ${admin.last_name}`,
          profile_type: "AdminUser",
          profile_id: admin.id,
        });

        return res.json({
          token,
          user: {
            id: admin.id,
            email: admin.email,
            username: admin.email,
            role: admin.role,
            first_name: admin.first_name,
            last_name: admin.last_name,
            profile_type: "AdminUser",
            profile_id: admin.id,
          },
        });
      }
    }

    const teacher = await prisma.teacher.findUnique({
      where: { staff_id: loginKey },
    });
    if (teacher) {
      let valid = false;
      if (teacher.custom_password) {
        const isBcrypt = teacher.custom_password.startsWith("$2");
        if (isBcrypt) {
          valid = await bcrypt.compare(password, teacher.custom_password);
        } else {
          valid = password === teacher.custom_password;
        }
      } else {
        valid = password === "User123";
      }

      if (valid) {
        let role = "teacher";
        if (teacher.teacher_type === "Head Teacher") role = "head_teacher";
        if (teacher.teacher_type === "Principal") role = "principal";

        await syncGenericUser({
          email: teacher.email,
          username: teacher.staff_id,
          password: teacher.custom_password || "User123",
          role,
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          profile_type: "Teacher",
          profile_id: teacher.id,
        });

        const token = generateToken({
          id: teacher.id,
          email: teacher.email,
          role,
          username: teacher.staff_id,
          name: `${teacher.first_name} ${teacher.last_name}`,
          profile_type: "Teacher",
          profile_id: teacher.id,
        });

        return res.json({
          token,
          user: {
            id: teacher.id,
            email: teacher.email,
            username: teacher.staff_id,
            role,
            first_name: teacher.first_name,
            last_name: teacher.last_name,
            profile_type: "Teacher",
            profile_id: teacher.id,
          },
        });
      }
    }

    const student = await prisma.student.findUnique({
      where: { admission_number: loginKey },
    });
    if (student) {
      let valid = false;
      if (student.custom_password) {
        const isBcrypt = student.custom_password.startsWith("$2");
        if (isBcrypt) {
          valid = await bcrypt.compare(password, student.custom_password);
        } else {
          valid = password === student.custom_password;
        }
      } else {
        valid = password === "User123";
      }

      if (valid) {
        await syncGenericUser({
          email: student.parent_email || "",
          username: student.admission_number,
          password: student.custom_password || "User123",
          role: "student",
          first_name: student.first_name,
          last_name: student.last_name,
          profile_type: "Student",
          profile_id: student.id,
        });

        const token = generateToken({
          id: student.id,
          email: student.parent_email || "",
          role: "student",
          username: student.admission_number,
          name: `${student.first_name} ${student.last_name}`,
          profile_type: "Student",
          profile_id: student.id,
        });

        return res.json({
          token,
          user: {
            id: student.id,
            email: student.parent_email || "",
            username: student.admission_number,
            role: "student",
            first_name: student.first_name,
            last_name: student.last_name,
            profile_type: "Student",
            profile_id: student.id,
          },
        });
      }
    }

    const parent = await prisma.parent.findUnique({
      where: { parent_id: loginKey },
    });
    if (parent) {
      let valid = false;
      if (parent.custom_password) {
        const isBcrypt = parent.custom_password.startsWith("$2");
        if (isBcrypt) {
          valid = await bcrypt.compare(password, parent.custom_password);
        } else {
          valid = password === parent.custom_password;
        }
      } else {
        valid =
          (parent.phone && password === parent.phone) || password === "User123";
      }

      if (valid) {
        await syncGenericUser({
          email: parent.email || "",
          username: parent.parent_id,
          password: parent.custom_password || parent.phone || "User123",
          role: "parent",
          first_name: parent.first_name,
          last_name: parent.last_name,
          profile_type: "Parent",
          profile_id: parent.id,
        });

        const token = generateToken({
          id: parent.id,
          email: parent.email || "",
          role: "parent",
          username: parent.parent_id,
          name: `${parent.first_name || ""} ${parent.last_name || ""}`.trim(),
          profile_type: "Parent",
          profile_id: parent.id,
        });

        return res.json({
          token,
          user: {
            id: parent.id,
            email: parent.email || "",
            username: parent.parent_id,
            role: "parent",
            first_name: parent.first_name,
            last_name: parent.last_name,
            profile_type: "Parent",
            profile_id: parent.id,
          },
        });
      }
    }

    const staff = await prisma.nonAcademicStaff.findUnique({
      where: { staff_id: loginKey },
    });
    if (staff) {
      let valid = false;
      if (staff.custom_password) {
        const isBcrypt = staff.custom_password.startsWith("$2");
        if (isBcrypt) {
          valid = await bcrypt.compare(password, staff.custom_password);
        } else {
          valid = password === staff.custom_password;
        }
      } else {
        valid = password === "admin220" || password === "User123";
      }

      if (valid) {
        await syncGenericUser({
          email: staff.email || "",
          username: staff.staff_id,
          password: staff.custom_password || "admin220",
          role: "accountant",
          first_name: staff.first_name,
          last_name: staff.last_name,
          profile_type: "NonAcademicStaff",
          profile_id: staff.id,
        });

        const token = generateToken({
          id: staff.id,
          email: staff.email || "",
          role: "accountant",
          username: staff.staff_id,
          name: `${staff.first_name} ${staff.last_name}`,
          profile_type: "NonAcademicStaff",
          profile_id: staff.id,
        });

        return res.json({
          token,
          user: {
            id: staff.id,
            email: staff.email || "",
            username: staff.staff_id,
            role: "accountant",
            first_name: staff.first_name,
            last_name: staff.last_name,
            profile_type: "NonAcademicStaff",
            profile_id: staff.id,
          },
        });
      }
    }

    return res.status(401).json({ error: "Invalid credentials." });
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/teacher-login — Teacher login (staff_id + password)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/teacher-login", async (req, res) => {
  try {
    const { staff_id, password } = req.body;
    if (!staff_id || !password) {
      return res
        .status(400)
        .json({ error: "Staff ID and password are required." });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { staff_id: staff_id.trim() },
    });
    if (!teacher) {
      return res.status(401).json({ error: "Invalid Staff ID or password." });
    }

    // Support plain-text passwords, bcrypt hashes, and default passwords
    let valid = false;
    if (teacher.custom_password) {
      const isBcrypt = teacher.custom_password.startsWith("$2");
      if (isBcrypt) {
        valid = await bcrypt.compare(password, teacher.custom_password);
      } else {
        valid = password === teacher.custom_password;
      }
    } else {
      valid = password === "User123";
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid Staff ID or password." });
    }

    // Determine role from teacher_type
    let role = "teacher";
    if (teacher.teacher_type === "Head Teacher") role = "head_teacher";
    if (teacher.teacher_type === "Principal") role = "principal";

    await syncGenericUser({
      email: teacher.email,
      username: teacher.staff_id,
      password: teacher.custom_password || "User123",
      role,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      profile_type: "Teacher",
      profile_id: teacher.id,
    });

    const token = generateToken({
      id: teacher.id,
      email: teacher.email,
      role,
      staff_id: teacher.staff_id,
      name: `${teacher.first_name} ${teacher.last_name}`,
      teacher_type: teacher.teacher_type,
    });

    return res.json({
      token,
      teacher: {
        id: teacher.id,
        staff_id: teacher.staff_id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        email: teacher.email,
        teacher_type: teacher.teacher_type,
        section: teacher.section,
        assigned_class: teacher.assigned_class,
        assigned_subjects: teacher.assigned_subjects,
        form_teacher_class: teacher.form_teacher_class,
        role,
      },
    });
  } catch (err) {
    console.error("[auth/teacher-login]", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/student-login — Student login (admission_number + password)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/student-login", async (req, res) => {
  try {
    const { admission_number, password } = req.body;
    if (!admission_number || !password) {
      return res
        .status(400)
        .json({ error: "Admission number and password are required." });
    }

    const student = await prisma.student.findUnique({
      where: { admission_number: admission_number.trim() },
    });
    if (!student) {
      return res
        .status(401)
        .json({ error: "Invalid admission number or password." });
    }

    let valid = false;
    if (student.custom_password) {
      const isBcrypt = student.custom_password.startsWith("$2");
      if (isBcrypt) {
        valid = await bcrypt.compare(password, student.custom_password);
      } else {
        valid = password === student.custom_password;
      }
    } else {
      valid = password === "User123";
    }

    if (!valid) {
      return res
        .status(401)
        .json({ error: "Invalid admission number or password." });
    }

    await syncGenericUser({
      email: student.parent_email || "",
      username: student.admission_number,
      password: student.custom_password || "User123",
      role: "student",
      first_name: student.first_name,
      last_name: student.last_name,
      profile_type: "Student",
      profile_id: student.id,
    });

    const token = generateToken({
      id: student.id,
      email: student.parent_email || "",
      role: "student",
      admission_number: student.admission_number,
      name: `${student.first_name} ${student.last_name}`,
    });

    return res.json({
      token,
      student: {
        id: student.id,
        admission_number: student.admission_number,
        first_name: student.first_name,
        last_name: student.last_name,
        current_class: student.current_class,
        section: student.section,
        role: "student",
      },
    });
  } catch (err) {
    console.error("[auth/student-login]", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/parent-login — Parent login (parent_id + password)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/parent-login", async (req, res) => {
  try {
    const { parent_id, password } = req.body;
    if (!parent_id || !password) {
      return res
        .status(400)
        .json({ error: "Parent ID and password are required." });
    }

    const parent = await prisma.parent.findUnique({
      where: { parent_id: parent_id.trim() },
    });
    if (!parent) {
      return res.status(401).json({ error: "Invalid Parent ID or password." });
    }

    let valid = false;
    if (parent.custom_password) {
      const isBcrypt = parent.custom_password.startsWith("$2");
      if (isBcrypt) {
        valid = await bcrypt.compare(password, parent.custom_password);
      } else {
        valid = password === parent.custom_password;
      }
    } else {
      valid =
        (parent.phone && password === parent.phone) || password === "User123";
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid Parent ID or password." });
    }

    await syncGenericUser({
      email: parent.email || "",
      username: parent.parent_id,
      password: parent.custom_password || parent.phone || "User123",
      role: "parent",
      first_name: parent.first_name,
      last_name: parent.last_name,
      profile_type: "Parent",
      profile_id: parent.id,
    });

    const token = generateToken({
      id: parent.id,
      email: parent.email || "",
      role: "parent",
      parent_id: parent.parent_id,
      name: `${parent.first_name || ""} ${parent.last_name || ""}`.trim(),
    });

    return res.json({
      token,
      parent: {
        id: parent.id,
        parent_id: parent.parent_id,
        first_name: parent.first_name,
        last_name: parent.last_name,
        email: parent.email,
        phone: parent.phone,
        custom_password: parent.custom_password,
        role: "parent",
      },
    });
  } catch (err) {
    console.error("[auth/parent-login]", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/accountant-login — Accountant login (staff_id + password)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/accountant-login", async (req, res) => {
  try {
    const { staff_id, password } = req.body;
    if (!staff_id || !password) {
      return res
        .status(400)
        .json({ error: "Staff ID and password are required." });
    }

    // Accountants use NonAcademicStaff or StaffRole
    const staffRole = await prisma.staffRole.findFirst({
      where: {
        user_email: staff_id.trim(),
        role: "Accountant",
        status: "Active",
      },
    });

    // Try NonAcademicStaff table
    const staff = await prisma.nonAcademicStaff.findUnique({
      where: { staff_id: staff_id.trim() },
    });

    if (!staff && !staffRole) {
      return res.status(401).json({ error: "Invalid Staff ID or password." });
    }

    const record = staff;
    let valid = false;
    if (record?.custom_password) {
      const isBcrypt = record.custom_password.startsWith("$2");
      if (isBcrypt) {
        valid = await bcrypt.compare(password, record.custom_password);
      } else {
        valid = password === record.custom_password;
      }
    } else {
      valid = password === "admin220" || password === "User123";
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid Staff ID or password." });
    }

    await syncGenericUser({
      email: record.email || "",
      username: record.staff_id,
      password: record.custom_password || "admin220",
      role: "accountant",
      first_name: record.first_name,
      last_name: record.last_name,
      profile_type: "NonAcademicStaff",
      profile_id: record.id,
    });

    const token = generateToken({
      id: record.id,
      email: record.email || "",
      role: "accountant",
      staff_id: record.staff_id,
      name: `${record.first_name} ${record.last_name}`,
    });

    return res.json({ token, staff: { ...record, role: "accountant" } });
  } catch (err) {
    console.error("[auth/accountant-login]", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me — Returns current authenticated user from JWT
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
  return res.json(req.user);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register-admin — Create the first admin user (one-time setup)
// Protected by a setup token in env so it can't be called by anyone
// ─────────────────────────────────────────────────────────────────────────────
router.post("/register-admin", async (req, res) => {
  try {
    const { setup_token, email, password, first_name, last_name } = req.body;
    const expectedToken = process.env.SETUP_TOKEN;

    if (!expectedToken || setup_token !== expectedToken) {
      return res.status(403).json({ error: "Invalid setup token." });
    }

    const existing = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      return res.status(409).json({ error: "Admin user already exists." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const admin = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        password: hashed,
        first_name,
        last_name,
        role: "admin",
      },
    });

    await syncGenericUser({
      email: admin.email,
      username: admin.email,
      password: hashed,
      role: admin.role,
      first_name: admin.first_name,
      last_name: admin.last_name,
      profile_type: "AdminUser",
      profile_id: admin.id,
    });

    return res.status(201).json({
      message: "Admin created successfully.",
      id: admin.id,
      email: admin.email,
    });
  } catch (err) {
    console.error("[auth/register-admin]", err);
    return res.status(500).json({ error: "Failed to create admin." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password — Reset password with bcrypt hashing
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { entity_type, record_id, new_password } = req.body;

    if (!entity_type || !record_id || !new_password) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    if (new_password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);
    let updatedRecord = null;

    switch (entity_type) {
      case "Teacher":
        updatedRecord = await prisma.teacher.update({
          where: { id: record_id },
          data: { custom_password: hashedPassword },
        });
        break;
      case "Student":
        updatedRecord = await prisma.student.update({
          where: { id: record_id },
          data: { custom_password: hashedPassword },
        });
        break;
      case "Parent":
        updatedRecord = await prisma.parent.update({
          where: { id: record_id },
          data: { custom_password: hashedPassword },
        });
        break;
      case "NonAcademicStaff":
        updatedRecord = await prisma.nonAcademicStaff.update({
          where: { id: record_id },
          data: { custom_password: hashedPassword },
        });
        break;
      case "AdminUser":
        updatedRecord = await prisma.adminUser.update({
          where: { id: record_id },
          data: { password: hashedPassword },
        });
        break;
      default:
        return res.status(400).json({ error: "Invalid entity type." });
    }

    // Sync generic User record if present
    const genericUser = await prisma.user.findFirst({
      where: { profile_type: entity_type, profile_id: record_id },
    });

    if (genericUser) {
      await prisma.user.update({
        where: { id: genericUser.id },
        data: { password: hashedPassword },
      });
    }

    return res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("[auth/reset-password]", err);
    return res
      .status(500)
      .json({ error: "Failed to reset password. Please try again." });
  }
});

export default router;
