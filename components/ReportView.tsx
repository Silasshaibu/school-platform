"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet } from "@/lib/client";

const f = (n: number | null) => (n === null ? "-" : String(n));

export default function ReportView({ studentId, termId }: { studentId: string; termId: string }) {
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`/api/report-cards/${studentId}?termId=${termId}`).then(setC).catch((e) => setError(e.message)); }, [studentId, termId]);

  if (error) return <div className="space-y-3"><p role="alert">{error}</p><a className="underline" href="/parent">Back to fees</a></div>;
  if (!c) return <p>Loading report card</p>;
  const th = "px-2 py-2 text-left font-medium";
  return (
    <article className="space-y-6">
      <div className="flex gap-2 print:hidden">
        <button className={btn} onClick={() => window.print()}>Print or save as PDF</button>
        <button className={btnQuiet} onClick={() => history.back()}>Back</button>
      </div>
      {!c.locked && <p className="rounded-lg bg-[#B45309]/10 p-3 print:hidden">Preview only. Parents can't see this until results are locked and released.</p>}
      <header>
        <p className="text-[#14213D]/70">{c.school.name}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{c.student.name}</h1>
        <p>{c.student.className}, {c.term.name} {c.term.year}. Admission number {c.student.admissionNo}</p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead><tr className="border-b border-[#14213D]/30"><th className={th}>Subject</th><th className={th}>Test 1 /{c.max.CA1}</th><th className={th}>Test 2 /{c.max.CA2}</th><th className={th}>Exam /{c.max.EXAM}</th><th className={th}>Total</th><th className={th}>Grade</th><th className={th}>Remark</th></tr></thead>
          <tbody>
            {c.subjects.map((s: any) => (
              <tr key={s.name} className="border-b border-[#14213D]/10 tabular-nums">
                <td className="px-2 py-2 font-medium">{s.name}</td><td className="px-2">{f(s.CA1)}</td><td className="px-2">{f(s.CA2)}</td><td className="px-2">{f(s.EXAM)}</td>
                <td className="px-2 font-medium">{f(s.total)}</td><td className="px-2">{s.grade ?? "-"}</td><td className="px-2">{s.remark ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <p><span className="block text-3xl font-semibold tabular-nums font-[family-name:var(--font-display)]">{c.summary.average}</span>Average score</p>
        <p><span className="block text-3xl font-semibold tabular-nums font-[family-name:var(--font-display)]">{c.summary.position ?? "-"}{c.summary.position && <span className="text-base font-normal"> of {c.summary.outOf}</span>}</span>Position in class</p>
        <p><span className="block text-3xl font-semibold tabular-nums font-[family-name:var(--font-display)]">{c.attendance.present + c.attendance.late}</span>Days present ({c.attendance.absent} absent, {c.attendance.late} late)</p>
      </section>

      <section className="space-y-3">
        <p><span className="font-medium">Class teacher's remark.</span> {c.teacherRemark || "None yet."}</p>
        <p><span className="font-medium">Head's remark.</span> {c.headRemark || "None yet."}</p>
      </section>
      <p className="text-sm text-[#14213D]/70">Grading: {c.scale.map((g: any) => `${g.grade} ${g.minScore}+ (${g.remark})`).join(", ")}</p>
    </article>
  );
}
