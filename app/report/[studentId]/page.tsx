import ReportView from "@/components/ReportView";

export default async function Page({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ termId?: string }> }) {
  const { studentId } = await params;
  const { termId } = await searchParams;
  return <ReportView studentId={studentId} termId={termId ?? ""} />;
}
