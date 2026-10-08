"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Term = { id: string; name: string; current: boolean; year: { name: string } };
type Row = { id: string; firstName: string; lastName: string; total: number; average: number; position: number | null; hasScores: boolean; teacherRemark: string; headRemark: string; locked: boolean };

export default function Reports() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classId, setClassId] = useState(""), [termId, setTermId] = useState("");
  const [role, setRole] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState(""), [error, setError] = useState("");

  const load = () => api<Row[]>(`/api/report-cards?classId=${classId}&termId=${termId}`).then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    Promise.all([api<Cls[]>("/api/classes"), api<Term[]>("/api/terms"), api("/api/me")]).then(([c, t, me]) => {
      setClasses(c); setTerms(t); setRole(me.role); if (c[0]) setClassId(c[0].id); const cur = t.find((x) => x.current) ?? t[0]; if (cur) setTermId(cur.id);
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { if (classId && termId) { setRows(null); setMsg(""); setError(""); load(); } }, [classId, termId]); // eslint-disable-line

  const edit = (id: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  async function saveRemarks(r: Row) {
    setError(""); setMsg("");
    try {
      await api("/api/report-cards", { method: "PUT", body: JSON.stringify({ termId, studentId: r.id, teacherRemark: r.teacherRemark, ...(role === "ADMIN" && { headRemark: r.headRemark }) }) });
      setMsg(`Saved remarks for ${r.firstName}.`);
    } catch (e) { setError((e as Error).message); }
  }
  async function setLock(locked: boolean) {
    const cls = classes.find((c) => c.id === classId);
    const ask = locked ? `Lock results for ${cls?.name}? Scores and remarks freeze, and parents can see report cards.` : `Unlock results for ${cls?.name}? Parents lose access until you lock again.`;
    if (!window.confirm(ask)) return;
    setError(""); setMsg("");
    try { await api("/api/report-cards/lock", { method: "POST", body: JSON.stringify({ termId, classId, locked }) }); setMsg(locked ? "Results locked and released." : "Results unlocked."); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  const allLocked = !!rows?.length && rows.every((r) => r.locked);

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Report cards</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className={field} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}</select>
        <select className={field} value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{t.year.name}, {t.name}</option>)}</select>
      </div>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {msg && <p role="status" className="text-[#1F7A4D]">{msg}</p>}
      {role === "ADMIN" && rows && rows.length > 0 && (
        <button className={allLocked ? btnQuiet : btn} onClick={() => setLock(!allLocked)}>{allLocked ? "Unlock results" : "Lock and release results"}</button>
      )}
      {rows && !rows.length && <p>No students in this class yet.</p>}
      <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white empty:hidden">
        {rows?.map((r) => (
          <li key={r.id} className="space-y-3 px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{r.firstName} {r.lastName}</p>
              <p className="text-right tabular-nums">{r.hasScores ? <>Average {r.average}<br />Position {r.position}</> : "No scores yet"}</p>
            </div>
            {r.locked && <p className="text-[#14213D]/70">Locked and released.</p>}
            <label className="block text-sm">Class teacher's remark
              <textarea className={field + " mt-1"} rows={2} maxLength={300} disabled={r.locked} value={r.teacherRemark} onChange={(e) => edit(r.id, { teacherRemark: e.target.value })} />
            </label>
            {role === "ADMIN" && (
              <label className="block text-sm">Head's remark
                <textarea className={field + " mt-1"} rows={2} maxLength={300} disabled={r.locked} value={r.headRemark} onChange={(e) => edit(r.id, { headRemark: e.target.value })} />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {!r.locked && <button className={btnQuiet} onClick={() => saveRemarks(r)}>Save remarks</button>}
              <a className={btnQuiet} href={`/report/${r.id}?termId=${termId}`}>Open report card</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
