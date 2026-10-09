import { headers } from "next/headers";
import { prisma } from "./db";

// A suspended school resolves to null, so its portal stops working until reactivated.
export async function getSchool() {
  const slug = (await headers()).get("x-school-slug");
  if (!slug) return null;
  const school = await prisma.school.findUnique({ where: { slug } });
  return school?.active ? school : null;
}
