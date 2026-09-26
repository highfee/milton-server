/**
 * roleGuard.js
 *
 * Maps each Prisma model + CRUD operation to the required roles.
 *
 * Role hierarchy (most → least privileged):
 *   admin > principal > head_teacher > teacher > accountant > parent > student
 *
 * null  = public access (no auth required)
 * []    = any authenticated user
 * [...] = specific roles only
 */

export const ROLE_RULES = {
  // ── Public read, admin-only write ──
  SchoolSettings: {
    list: null,
    filter: null,
    get: null,
    create: ["admin", "principal"],
    update: ["admin", "principal"],
    delete: ["admin"],
  },

  Gallery: {
    list: null,
    filter: null,
    get: null,
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin", "principal"],
  },

  Calendar: {
    list: null,
    filter: null,
    get: null,
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin", "principal"],
  },

  Holiday: {
    list: null,
    filter: null,
    get: null,
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  Newsletter: {
    list: null,
    filter: null,
    get: null,
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin", "principal"],
  },

  // ── Students ──
  Student: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "accountant"],
    update: ["admin", "principal", "head_teacher", "teacher", "accountant", "student"],
    delete: ["admin", "principal"],
  },

  ArchivedStudent: {
    list: ["admin", "principal", "head_teacher"],
    filter: ["admin", "principal", "head_teacher"],
    get: ["admin", "principal", "head_teacher"],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal"],
    delete: ["admin"],
  },

  // ── Teachers & Staff ──
  Teacher: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal"],
    update: ["admin", "teacher", "head_teacher", "principal"],
    delete: ["admin"],
  },

  NonAcademicStaff: {
    list: ["admin", "principal", "accountant"],
    filter: ["admin", "principal", "accountant"],
    get: ["admin", "principal", "accountant"],
    create: ["admin", "principal", "accountant"],
    update: ["admin", "principal", "accountant"],
    delete: ["admin"],
  },

  // ── Parents ──
  Parent: {
    list: ["admin", "principal", "head_teacher", "accountant"],
    filter: ["admin", "principal", "head_teacher", "parent", "accountant"],
    get: ["admin", "principal", "head_teacher", "parent", "accountant"],
    create: ["admin", "principal", "accountant"],
    update: ["admin", "principal", "parent", "accountant"],
    delete: ["admin"],
  },

  ParentStudent: {
    list: ["admin", "principal", "accountant"],
    filter: ["admin", "principal", "parent", "accountant"],
    get: ["admin", "principal", "parent", "accountant"],
    create: ["admin", "principal", "accountant"],
    update: ["admin", "principal", "accountant"],
    delete: ["admin"],
  },

  // ── Subjects & Classes ──
  Subject: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin", "principal"],
  },

  SchoolClass: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  Class: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  StaffRole: {
    list: ["admin", "principal"],
    filter: ["admin", "principal", "teacher"],
    get: ["admin", "principal", "teacher"],
    create: ["admin", "principal"],
    update: ["admin", "principal"],
    delete: ["admin", "principal"],
  },

  // ── Results ──
  Result: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "teacher", "head_teacher", "principal"],
    update: ["admin", "teacher", "head_teacher", "principal"],
    delete: ["admin", "teacher", "head_teacher", "principal"],
  },

  ReportCard: {
    list: ["admin", "principal", "head_teacher"],
    filter: [
      "admin",
      "principal",
      "head_teacher",
      "teacher",
      "student",
      "parent",
    ],
    get: [
      "admin",
      "principal",
      "head_teacher",
      "teacher",
      "student",
      "parent",
    ],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  ResultToken: {
    list: ["admin", "accountant"],
    filter: null, // public — token checking
    get: null,
    create: ["admin", "accountant"],
    update: ["admin", "accountant"],
    delete: ["admin"],
  },

  // ── Attendance ──
  Attendance: {
    list: ["admin", "principal", "head_teacher", "teacher"],
    filter: [],
    get: [],
    create: ["admin", "teacher", "head_teacher"],
    update: ["admin", "teacher", "head_teacher"],
    delete: ["admin"],
  },

  // ── Assignments ──
  Assignment: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "teacher"],
    update: ["admin", "teacher"],
    delete: ["admin", "teacher"],
  },

  AssignmentSubmission: {
    list: ["admin", "teacher"],
    filter: [],
    get: [],
    create: ["student", "admin"],
    update: ["teacher", "admin"],
    delete: ["admin"],
  },

  // ── CBT ──
  CBTExam: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "teacher"],
    update: ["admin", "teacher"],
    delete: ["admin", "teacher"],
  },

  CBTResult: {
    list: ["admin", "teacher", "principal"],
    filter: [],
    get: [],
    create: ["student", "admin"],
    update: ["admin", "teacher"],
    delete: ["admin"],
  },

  CBTExamPassword: {
    list: ["admin", "teacher", "principal"],
    filter: ["admin", "teacher", "student"],
    get: ["admin", "teacher", "student"],
    create: ["admin", "teacher"],
    update: ["admin", "teacher"],
    delete: ["admin"],
  },

  CBTMalpractice: {
    list: ["admin", "teacher", "principal", "head_teacher"],
    filter: ["admin", "teacher", "principal", "head_teacher"],
    get: ["admin", "teacher", "principal", "head_teacher"],
    create: ["admin", "teacher"],
    update: ["admin", "teacher", "principal", "head_teacher"],
    delete: ["admin"],
  },

  // ── Fees ──
  SchoolFeePayment: {
    list: ["admin", "accountant", "principal"],
    filter: [],
    get: [],
    create: ["admin", "accountant"],
    update: ["admin", "accountant"],
    delete: ["admin"],
  },

  FeePayment: {
    list: ["admin", "accountant", "principal"],
    filter: [],
    get: [],
    create: ["admin", "accountant"],
    update: ["admin", "accountant"],
    delete: ["admin"],
  },

  SalaryPayment: {
    list: ["admin", "accountant", "principal"],
    filter: ["admin", "accountant", "principal"],
    get: ["admin", "accountant", "principal"],
    create: ["admin", "accountant"],
    update: ["admin", "accountant"],
    delete: ["admin"],
  },

  Expense: {
    list: ["admin", "accountant", "principal"],
    filter: ["admin", "accountant", "principal"],
    get: ["admin", "accountant", "principal"],
    create: ["admin", "accountant"],
    update: ["admin", "accountant", "principal"],
    delete: ["admin"],
  },

  // ── Admission ──
  AdmissionApplication: {
    list: ["admin", "principal", "accountant"],
    filter: null,
    get: null,
    create: null,
    update: null,
    delete: ["admin"],
  },

  // ── Content ──
  Timetable: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  LessonNote: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "teacher"],
    update: ["admin", "teacher"],
    delete: ["admin", "teacher"],
  },

  // ── Communication ──
  Message: {
    list: [],
    filter: [],
    get: [],
    create: [],
    update: [],
    delete: ["admin"],
  },

  ChatMessage: {
    list: [],
    filter: [],
    get: [],
    create: [],
    update: [],
    delete: ["admin"],
  },

  ChatPresence: {
    list: [],
    filter: [],
    get: [],
    create: [],
    update: [],
    delete: ["admin"],
  },

  Meeting: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  PTAMeeting: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  PublicMessage: {
    list: ["admin", "principal"],
    filter: ["admin", "principal"],
    get: ["admin", "principal"],
    create: null,
    update: ["admin"],
    delete: ["admin"],
  },

  // ── Student Records ──
  Award: {
    list: [],
    filter: [],
    get: [],
    create: ["admin", "principal", "head_teacher", "teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  Discipline: {
    list: ["admin", "principal", "head_teacher"],
    filter: [],
    get: [],
    create: ["admin", "teacher", "principal", "head_teacher"],
    update: ["admin", "principal", "head_teacher"],
    delete: ["admin"],
  },

  Rating: {
    list: ["admin", "teacher"],
    filter: [],
    get: [],
    create: [],
    update: ["admin"],
    delete: ["admin"],
  },

  // ── Director / School Projects ──
  SchoolProject: {
    list: ["admin", "principal"],
    filter: ["admin", "principal", "parent"],
    get: ["admin", "principal", "parent"],
    create: ["admin", "principal"],
    update: ["admin", "principal"],
    delete: ["admin"],
  },

  DirectorNotification: {
    list: ["admin", "principal"],
    filter: ["admin", "principal"],
    get: ["admin", "principal"],
    create: ["admin", "principal"],
    update: ["admin", "principal"],
    delete: ["admin"],
  },

  // ── Users ──
  User: {
    list: ["admin"],
    filter: ["admin"],
    get: ["admin"],
    create: ["admin"],
    update: ["admin"],
    delete: ["admin"],
  },

  AdminUser: {
    list: ["admin"],
    filter: ["admin"],
    get: ["admin"],
    create: ["admin"],
    update: ["admin"],
    delete: ["admin"],
  },
};

/**
 * getRequiredRoles(model, operation)
 * Returns the roles array for a given model + CRUD op.
 * null  = public access
 * []    = any authenticated user
 * [...] = specific roles required
 */
export function getRequiredRoles(model, operation) {
  const modelRules = ROLE_RULES[model];
  if (!modelRules) return []; // default: any authenticated user
  const opRules = modelRules[operation];
  if (opRules === undefined) return []; // default: any authenticated user
  return opRules;
}
