"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Sub = { id: string; name: string; classIds: string[] };

export default function Subjects() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [on, setOn] = useState<Set<string>>(new Set()); // `${subjectId}:${classId}`
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(""), [error, setError] = useState("");

  const load = async () => {
    const [c, s] = await Promise.all([api<Cls[]>("/api/classes"), api<Sub[]>("/api/subjects")]);
    setClasses(c); setSubs(s); setOn(new Set(s.flatMap((x) => x.classIds.map((cid) => `${x.id}:${cid}`))));
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const flip = (k: string) => setOn((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  async function save() {
    setError(""); setMsg("");
    try {
      for (const c of classes) await api("/api/class-subjects", { method: "PUT", body: JSON.stringify({ classId: c.id, subjectIds: subs.filter((s) => on.has(`${s.id}:${c.id}`)).map((s) => s.id) }) });
      setMsg("Saved.");
    } catch (e) { setError((e as Error).message); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api("/api/subjects", { method: "POST", body: JSON.stringify({ name }) }); setName(""); await load(); } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Subjects</h1>
      <p>Tick the classes that take each subject. Teachers enter scores only for the subjects set here.</p>
      {subs.map((s) => (
        <fieldset key={s.id} className="border-t border-[#14213D]/10 pt-3">
          <legend className="font-medium">{s.name}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.id} className={`cursor-pointer rounded-full border px-3 py-2 ${on.has(`${s.id}:${c.id}`) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[#14213D]/20 bg-white"}`}>
                <input type="checkbox" className="sr-only" checked={on.has(`${s.id}:${c.id}`)} onChange={() => flip(`${s.id}:${c.id}`)} />{c.name} {c.arm}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {msg && <p role="status" className="text-[#1F7A4D]">{msg}</p>}
      <button className={btn} onClick={save}>Save subjects</button>
      <form onSubmit={add} className="flex max-w-sm gap-2"><input className={field} placeholder="Add a subject" aria-label="New subject" value={name} onChange={(e) => setName(e.target.value)} /><button className={btnQuiet} disabled={name.trim().length < 2}>Add</button></form>
    </div>
  );
}
