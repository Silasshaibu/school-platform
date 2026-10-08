import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

// Models that carry schoolId and must always be tenant-scoped.
const TENANT_MODELS = new Set([
  "AcademicYear","Term","SchoolClass","Subject","ClassSubject","Student","Guardian",
  "StudentGuardian","Application","Document","FeeItem","FeeStructure","Invoice",
  "InvoiceLine","Payment","Attendance","Score","GradeScale","ReportCard","Announcement","InviteToken",
]);

/**
 * Tenant-scoped client. Every query is filtered by schoolId and every create is
 * stamped with it, so one school can never read or write another's data.
 * Note: pass scalar IDs (classId: "...") on creates, not nested connect blocks.
 */
export function tenantDb(schoolId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a: any = args ?? {};
          if (operation === "create") a.data = { ...a.data, schoolId };
          else if (operation === "createMany")
            a.data = ([] as any[]).concat(a.data).map((d) => ({ ...d, schoolId }));
          else if (operation === "upsert") {
            a.where = { ...a.where, schoolId };
            a.create = { ...a.create, schoolId };
          } else a.where = { ...a.where, schoolId };
          return query(a);
        },
      },
    },
  });
}
