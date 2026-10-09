"use client";
import { useEffect, useState } from "react";
import { api, btn, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Sub = { id: string; name: string };
type Term = { id: string; name: string; current: boolean; year: { name: string } };
type Row = { id: string; firstName: string; lastName: string; locked: boolean; scores: Record<string, number> };
const COMPS: [string, string][] = [["CA1", "Test 1"], ["CA2", "Test 2"], ["EXAM", "Exam"]];

export default function Scores() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Sub[]>([]);
  const [classId, setClassId] = useState(""), [subjectId, setSubjectId] = useState(""), [termId, setTermId] = useState("");
  const [max, setMax] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({}); // `${studentId}:${comp}`
  const [msg, setMsg] = useState(""), [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Cls[]>("/api/classes"), api<Term[]>("/api/terms")]).then(([c, t]) => {
      setClasses(c); setTerms(t); if (c[0]) setClassId(c[0].id); const cur = t.find((x) => x.current) ?? t[0]; if (cur) setTermId(cur.id);
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!classId) return;
    setSubjectId(""); setRows(null);
    api<Sub[]>(`/api/subjects?classId=${classId}`).then((s) => { setSubjects(s); if (s[0]) setSubjectId(s[0].id); }).catch((e) => setError(e.message));
  }, [classId]);
  useEffect(() => {
    if (!classId || !subjectId || !termId) return;
    setRows(null); setMsg(""); setError("");
    api(`/api/scores?classId=${classId}&subjectId=${subjectId}&termId=${termId}`).then((r) => {
      setMax(r.max); setRows(r.students);
      setVals(Object.fromEntries(r.students.flatMap((s: Row) => COMPS.map(([c]) => [`${s.id}:${c}`, s.scores[c] !== undefined ? String(s.scores[c]) : ""]))));
    }).catch((e) => setError(e.message));
  }, [classId, subjectId, termId]);

  async function save() {
    setError(""); setMsg("");
    const payload = rows!.filter((r) => !r.locked).map((r) => {
      const o: any = { studentId: r.id };
      for (const [c] of COMPS) { const t = vals[`${r.id}:${c}`].trim(); o[c] = t === "" ? null : Number(t); }
      return o;
    });
    const bad = payload.find((p) => COMPS.some(([c]) => p[c] !== null && (!Number.isFinite(p[c]) || p[c] < 0 || p[c] > max[c])));
    if (bad) return setError(`Scores must be numbers within each limit: Test 1 up to ${max.CA1}, Test 2 up to ${max.CA2}, Exam up to ${max.EXAM}.`);
    try { await api("/api/scores", { method: "PUT", body: JSON.stringify({ classId, subjectId, termId, rows: payload }) }); setMsg("Scores saved."); }
    catch (e) { setError((e as Error).message); }
  }

  const total = (id: string) => COMPS.reduce((s, [c]) => s + (Number(vals[`${id}:${c}`]) || 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Scores</h1>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={field} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}</select>
        <select className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className={field} value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{t.year.name}, {t.name}</option>)}</select>
      </div>
      {!subjects.length && classId && <p>No subjects set for this class. An admin can add them under Subjects.</p>}
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {rows && !rows.length && <p>No students in this class yet.</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <p className="flex justify-between font-medium"><span>{r.firstName} {r.lastName}</span><span className="tabular-nums">{total(r.id)} / 100</span></p>
                {r.locked ? <p className="text-[#14213D]/70">Results are locked for this term.</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {COMPS.map(([c, label]) => (
                      <label key={c} className="block text-sm">{label} (max {max[c]})
                        <input className={field + " mt-1"} inputMode="decimal" value={vals[`${r.id}:${c}`] ?? ""} onChange={(e) => setVals({ ...vals, [`${r.id}:${c}`]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {msg && <p role="status" className="text-[#1F7A4D]">{msg}</p>}
          <button className={btn + " w-full sm:w-auto"} onClick={save}>Save scores</button>
        </>
      )}
    </div>
  );
}
