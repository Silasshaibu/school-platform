import { prisma } from "./db";

/** Atomic per-school admission numbers, e.g. SCH/2026/0001. */
export async function nextAdmissionNo(schoolId: string) {
  const s = await prisma.school.update({
    where: { id: schoolId }, data: { admissionSeq: { increment: 1 } },
  });
  return `${s.admissionPrefix}/${new Date().getFullYear()}/${String(s.admissionSeq).padStart(4, "0")}`;
}
