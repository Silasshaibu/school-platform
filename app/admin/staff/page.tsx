"use client";
import { useEffect, useState } from "react";
import { api, btn, field } from "@/lib/client";

type S = { id: string; name: string; email: string; role: string };
const ROLE: Record<string, string> = { ADMIN: "Admin", BURSAR: "Bursar", TEACHER: "Teacher" };

export default function Staff() {
  const [list, setList] = useState<S[]>([]);
  const [f, setF] = useState({ name: "", email: "", role: "TEACHER", password: "" });
  const [error, setError] = useState("");
  const load = () => api<S[]>("/api/staff").then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try { await api("/api/staff", { method: "POST", body: JSON.stringify(f) }); setF({ name: "", email: "", role: "TEACHER", password: "" }); load(); }
    catch (err) { setError((err as Error).message); }
  }
  return (
    <div className="space-y-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Staff</h1>
      <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
        {list.map((s) => (<li key={s.id} className="flex justify-between gap-3 px-4 py-3"><span>{s.name}<br /><span className="text-[#14213D]/70">{s.email}</span></span><span>{ROLE[s.role]}</span></li>))}
      </ul>
      <form onSubmit={add} className="max-w-sm space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Add a staff member</h2>
        <input className={field} required placeholder="Full name" aria-label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={field} required type="email" placeholder="Email" aria-label="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <select className={field} aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="TEACHER">Teacher</option><option value="BURSAR">Bursar</option></select>
        <input className={field} required minLength={8} type="text" placeholder="Starting password (they change it after signing in)" aria-label="Starting password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && <p role="alert" className="text-[#B42318]">{error}</p>}
        <button className={btn}>Add staff member</button>
      </form>
    </div>
  );
}
