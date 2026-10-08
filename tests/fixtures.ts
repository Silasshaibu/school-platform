/** Shared fixtures for the test suites (all rows live in the scratch test DB). */
import { tx, truncateAll } from "./harness";
import bcrypt from "bcryptjs";

export type Fixtures = ReturnType<typeof make>;

/** Wipe + seed two schools with everything needed by every suite. */
export async function make() {
  await truncateAll();

  const demo = await tx.school.create({
    data: { slug: "demo", name: "Demo School", admissionPrefix: "DEM", siblingDiscountPercent: 10 },
  });
  const other = await tx.school.create({
    data: { slug: "other", name: "Other School", admissionPrefix: "OTH" },
  });

  const hash = await bcrypt.hash("Passw0rd!", 4); // low cost: tests only
  const admin = await tx.user.create({
    data: { schoolId: demo.id, email: "admin@demo.test", name: "Admin", role: "ADMIN", passwordHash: hash },
  });
  const bursar = await tx.user.create({
    data: { schoolId: demo.id, email: "bursar@demo.test", name: "Bursar", role: "BURSAR", passwordHash: hash },
  });
  const teacher = await tx.user.create({
    data: { schoolId: demo.id, email: "teacher@demo.test", name: "Teacher", role: "TEACHER", passwordHash: hash },
  });
  const otherAdmin = await tx.user.create({
    data: { schoolId: other.id, email: "admin@other.test", name: "Other Admin", role: "ADMIN", passwordHash: hash },
  });
  const superAdmin = await tx.user.create({
    data: { schoolId: null, email: "owner@platform.test", name: "Owner", role: "SUPER_ADMIN", passwordHash: hash },
  });

  const year = await tx.academicYear.create({
    data: { schoolId: demo.id, name: "2026/2027", startsOn: new Date("2026-09-01"), endsOn: new Date("2027-08-01"), current: true },
  });
  const term = await tx.term.create({
    data: { schoolId: demo.id, yearId: year.id, name: "First Term", startsOn: new Date("2026-09-08"), endsOn: new Date("2026-12-18"), current: true },
  });
  const otherYear = await tx.academicYear.create({
    data: { schoolId: other.id, name: "2026/2027", startsOn: new Date("2026-09-01"), endsOn: new Date("2027-08-01"), current: true },
  });
  const otherTerm = await tx.term.create({
    data: { schoolId: other.id, yearId: otherYear.id, name: "First Term", startsOn: new Date("2026-09-08"), endsOn: new Date("2026-12-18"), current: true },
  });

  const p1 = await tx.schoolClass.create({ data: { schoolId: demo.id, name: "Primary 1", level: 1 } });
  const p2 = await tx.schoolClass.create({ data: { schoolId: demo.id, name: "Primary 2", level: 2 } });
  const otherClass = await tx.schoolClass.create({ data: { schoolId: other.id, name: "Primary 1", level: 1 } });

  const eng = await tx.subject.create({ data: { schoolId: demo.id, name: "English Studies" } });
  const maths = await tx.subject.create({ data: { schoolId: demo.id, name: "Mathematics" } });
  const otherSubject = await tx.subject.create({ data: { schoolId: other.id, name: "English Studies" } });

  for (const [classId, subjectId] of [
    [p1.id, eng.id], [p1.id, maths.id], [p2.id, eng.id], [p2.id, maths.id],
  ] as const)
    await tx.classSubject.create({ data: { schoolId: demo.id, classId, subjectId } });
  await tx.classSubject.create({ data: { schoolId: other.id, classId: otherClass.id, subjectId: otherSubject.id } });

  const tuition = await tx.feeItem.create({ data: { schoolId: demo.id, name: "Tuition" } });
  const books = await tx.feeItem.create({ data: { schoolId: demo.id, name: "Books" } });
  for (const classId of [p1.id, p2.id]) {
    await tx.feeStructure.create({ data: { schoolId: demo.id, classId, termId: term.id, feeItemId: tuition.id, amountKobo: 5000000 } });
    await tx.feeStructure.create({ data: { schoolId: demo.id, classId, termId: term.id, feeItemId: books.id, amountKobo: 1000000 } });
  }

  await tx.gradeScale.createMany({
    data: [
      { minScore: 70, grade: "A", remark: "Excellent" },
      { minScore: 60, grade: "B", remark: "Very Good" },
      { minScore: 50, grade: "C", remark: "Good" },
      { minScore: 40, grade: "D", remark: "Fair" },
      { minScore: 0, grade: "E", remark: "Needs improvement" },
    ].map((g) => ({ ...g, schoolId: demo.id })),
  });

  const dob = new Date("2019-05-01");
  const mk = (firstName: string, lastName: string, classId: string, admissionNo: string, schoolId = demo.id) =>
    tx.student.create({ data: { schoolId, firstName, lastName, dob, gender: "M", classId, admissionNo } });

  const ada = await mk("Ada", "Okafor", p1.id, "DEM/2026/0001");
  const zara = await mk("Zara", "Okafor", p2.id, "DEM/2026/0002"); // Ada's sibling (same guardian phone)
  const ben = await mk("Ben", "Eze", p1.id, "DEM/2026/0003");
  const cal = await mk("Cal", "Uche", p1.id, "DEM/2026/0004");
  const dana = await mk("Dana", "Ali", p1.id, "DEM/2026/0005");
  const eve = await mk("Eve", "James", p1.id, "OTH/2026/0001", other.id);

  const gOk = await tx.guardian.create({ data: { schoolId: demo.id, name: "Mrs Okafor", phone: "08031112222" } });
  const gEze = await tx.guardian.create({ data: { schoolId: demo.id, name: "Mr Eze", phone: "08033334444" } });
  const gOther = await tx.guardian.create({ data: { schoolId: other.id, name: "Other Parent", phone: "08099998888" } });
  for (const [studentId, guardianId] of [
    [ada.id, gOk.id], [zara.id, gOk.id], [ben.id, gEze.id],
  ] as const)
    await tx.studentGuardian.create({ data: { schoolId: demo.id, studentId, guardianId, relation: "Parent", isPrimary: true } });
  await tx.studentGuardian.create({ data: { schoolId: other.id, studentId: eve.id, guardianId: gOther.id, relation: "Parent", isPrimary: true } });

  const app = await tx.application.create({
    data: { schoolId: demo.id, childName: "New Child", classWanted: "Primary 1", parentName: "Mr Test", parentPhone: "08012345678", stage: "ACCEPTED", childDob: dob },
  });

  return { demo, other, term, otherTerm, p1, p2, otherClass, eng, maths, otherSubject, tuition, books, admin, bursar, teacher, otherAdmin, superAdmin, ada, zara, ben, cal, dana, eve, app };
}
