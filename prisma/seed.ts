import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const school = await prisma.school.upsert({
    where: { slug: "demo" }, update: {},
    create: { slug: "demo", name: "Demo School", admissionPrefix: "DEM" },
  });
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: "admin@demo.test" } }, update: {},
    create: { schoolId: school.id, email: "admin@demo.test", passwordHash, name: "School Admin", role: "ADMIN" },
  });
  const levels = ["Nursery 1","Nursery 2","Primary 1","Primary 2","Primary 3","Primary 4","Primary 5"];
  for (const [i, name] of levels.entries())
    await prisma.schoolClass.upsert({
      where: { schoolId_name_arm: { schoolId: school.id, name, arm: "" } }, update: {},
      create: { schoolId: school.id, name, level: i + 1 },
    });
  if (!(await prisma.gradeScale.count({ where: { schoolId: school.id } })))
    await prisma.gradeScale.createMany({ data: [
      { minScore: 70, grade: "A", remark: "Excellent" }, { minScore: 60, grade: "B", remark: "Very Good" },
      { minScore: 50, grade: "C", remark: "Good" }, { minScore: 40, grade: "D", remark: "Fair" },
      { minScore: 0, grade: "E", remark: "Needs improvement" },
    ].map((g) => ({ ...g, schoolId: school.id })) });
  const core = ["English Studies", "Mathematics", "Basic Science", "Social Studies", "Civic Education", "Computer Studies", "Creative Arts", "Physical Education", "Religious Studies", "Verbal Reasoning", "Quantitative Reasoning"];
  for (const name of core)
    await prisma.subject.upsert({ where: { schoolId_name: { schoolId: school.id, name } }, update: {}, create: { schoolId: school.id, name } });
  const classes = await prisma.schoolClass.findMany({ where: { schoolId: school.id } });
  const subs = await prisma.subject.findMany({ where: { schoolId: school.id } });
  const early = new Set(["English Studies", "Mathematics", "Creative Arts", "Physical Education"]);
  await prisma.classSubject.createMany({
    skipDuplicates: true,
    data: classes.flatMap((c) => subs.filter((s) => c.name.startsWith("Primary") || early.has(s.name)).map((s) => ({ schoolId: school.id, classId: c.id, subjectId: s.id }))),
  });
  if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) {
    const email = process.env.SUPER_ADMIN_EMAIL.toLowerCase();
    if (!(await prisma.user.findFirst({ where: { schoolId: null, email } })))
      await prisma.user.create({ data: { schoolId: null, email, name: "Platform Owner", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 12) } });
  }
}
main().finally(() => prisma.$disconnect());
