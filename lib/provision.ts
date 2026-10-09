import { prisma } from "./db";
import { hashPassword } from "./auth";

const LEVELS = ["Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5"];
const SUBJECTS = ["English Studies", "Mathematics", "Basic Science", "Social Studies", "Civic Education", "Computer Studies", "Creative Arts", "Physical Education", "Religious Studies", "Verbal Reasoning", "Quantitative Reasoning"];
const EARLY = new Set(["English Studies", "Mathematics", "Creative Arts", "Physical Education"]);
const GRADES = [[70, "A", "Excellent"], [60, "B", "Very Good"], [50, "C", "Good"], [40, "D", "Fair"], [0, "E", "Needs improvement"]] as const;

/** Creates a ready-to-run school: admin login, classes, subjects, grade scale. */
export async function provisionSchool(i: { name: string; slug: string; adminName: string; adminEmail: string; adminPassword: string; primaryColor?: string; admissionPrefix?: string }) {
  const passwordHash = await hashPassword(i.adminPassword);
  return prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: { slug: i.slug, name: i.name, admissionPrefix: i.admissionPrefix ?? i.slug.replace(/-/g, "").slice(0, 3).toUpperCase(), ...(i.primaryColor && { primaryColor: i.primaryColor }) },
    });
    const schoolId = school.id;
    await tx.user.create({ data: { schoolId, email: i.adminEmail.toLowerCase(), passwordHash, name: i.adminName, role: "ADMIN" } });
    await tx.schoolClass.createMany({ data: LEVELS.map((name, n) => ({ schoolId, name, level: n + 1 })) });
    await tx.gradeScale.createMany({ data: GRADES.map(([minScore, grade, remark]) => ({ schoolId, minScore, grade, remark })) });
    await tx.subject.createMany({ data: SUBJECTS.map((name) => ({ schoolId, name })) });
    const [classes, subjects] = await Promise.all([tx.schoolClass.findMany({ where: { schoolId } }), tx.subject.findMany({ where: { schoolId } })]);
    await tx.classSubject.createMany({
      data: classes.flatMap((c) => subjects.filter((s) => c.name.startsWith("Primary") || EARLY.has(s.name)).map((s) => ({ schoolId, classId: c.id, subjectId: s.id }))),
    });
    return school;
  });
}
