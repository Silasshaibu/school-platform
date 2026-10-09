import { PrismaClient } from "@prisma/client";
const url = "postgresql://postgres:postgres@localhost:5432/school_test?schema=public";
(async () => {
  const p = new PrismaClient({ datasources: { db: { url } } });
  await p.$executeRaw`TRUNCATE "School" CASCADE`;
  const a = await p.school.create({ data: { slug: "a", name: "A" } });
  console.log("school created:", a.id);
  try {
    const s = await p.subject.create({ data: { name: "Maths", schoolId: a.id } });
    console.log("subject OK:", s.id, s.schoolId);
  } catch (e: any) {
    console.log("subject FAILED:", e.message.split("\n").slice(-3).join(" | "));
    const rows = await p.$queryRaw`select id, slug from "School"`;
    console.log("schools visible now:", JSON.stringify(rows));
  }
  await p.$disconnect();
})();
