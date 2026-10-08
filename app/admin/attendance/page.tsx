"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Status = "PRESENT" | "ABSENT" | "LATE";
type Row = { id: string; firstName: string; lastName: string; status: Status | null };
const OPTS: [Status, string][] = [["PRESENT", "Present"], ["ABSENT", "Absent"], ["LATE", "Late"]];
const today = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [msg, setMsg] = useState(""), [error, setError] = useState("");

  useEffect(() => { api<Cls[]>("/api/classes").then((c) => { setClasses(c); if (c[0]) setClassId(c[0].id); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!classId) return;
    setRows(null); setMsg(""); setError("");
    api<Row[]>(`/api/attendance?classId=${classId}&date=${date}`)
      .then((r) => { setRows(r); setMarks(Object.fromEntries(r.map((s) => [s.id, s.status ?? "PRESENT"]))); })
      .catch((e) => setError(e.message));
  }, [classId, date]);

  async function save() {
    setError(""); setMsg("");
    try {
      await api("/api/attendance", { method: "PUT", body: JSON.stringify({ classId, date, marks: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) }) });
      const v = Object.values(marks);
      setMsg(`Saved. ${v.filter((x) => x === "PRESENT").length} present, ${v.filter((x) => x === "ABSENT").length} absent, ${v.filter((x) => x === "LATE").length} late.`);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Attendance</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className={field} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}</select>
        <input className={field} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </div>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {rows && !rows.length && <p>No students in this class yet.</p>}
      {rows && rows.length > 0 && (
        <>
          <button className={btnQuiet} onClick={() => setMarks(Object.fromEntries(rows.map((r) => [r.id, "PRESENT" as Status])))}>Mark everyone present</button>
          <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <p className="font-medium">{r.firstName} {r.lastName}</p>
                <div className="flex gap-2" role="group" aria-label={`Attendance for ${r.firstName}`}>
                  {OPTS.map(([v, label]) => (
                    <button key={v} aria-pressed={marks[r.id] === v} onClick={() => setMarks({ ...marks, [r.id]: v })}
                      className={`flex-1 rounded-lg border px-3 py-3 ${marks[r.id] === v ? (v === "ABSENT" ? "border-[#B42318] bg-[#B42318] text-white" : "border-[var(--brand)] bg-[var(--brand)] text-white") : "border-[#14213D]/20"}`}>{label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {msg && <p role="status" className="text-[#1F7A4D]">{msg}</p>}
          <button className={btn + " w-full sm:w-auto"} onClick={save}>Save attendance</button>
        </>
      )}
    </div>
  );
}
