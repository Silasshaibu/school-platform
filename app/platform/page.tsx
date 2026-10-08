"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet, field } from "@/lib/client";

type S = { id: string; name: string; slug: string; plan: string; active: boolean; students: number; url: string };
const PLANS = ["trial", "starter", "standard", "premium"];
const blank = { name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" };

export default function Platform() {
  const [list, setList] = useState<S[] | null>(null);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState(""), [error, setError] = useState("");
  const load = () => api<S[]>("/api/platform/schools").then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMsg("");
    try {
      const r = await api("/api/platform/schools", { method: "POST", body: JSON.stringify(f) });
      setMsg(`Created. Send the school admin this address and their starting password: ${r.url}`);
      setF(blank); load();
    } catch (err) { setError((err as Error).message); }
  }
  async function patch(s: S, data: object) {
    setError("");
    try { await api(`/api/platform/schools/${s.id}`, { method: "PATCH", body: JSON.stringify(data) }); load(); } catch (e) { setError((e as Error).message); }
  }
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Your schools</h1>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {msg && <p role="status" className="break-all text-[#1F7A4D]">{msg}</p>}
      {list && !list.length && <p>No schools yet. Add your first one below.</p>}
      <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white empty:hidden">
        {list?.map((s) => (
          <li key={s.id} className="space-y-2 px-4 py-4">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{s.name} {!s.active && <span className="text-base font-normal text-[#B42318]">(suspended)</span>}</p>
            <p><a className="break-all underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a></p>
            <p>{s.students} active students</p>
            <div className="flex flex-wrap gap-2">
              <select className={field + " w-40"} aria-label={`Plan for ${s.name}`} value={s.plan} onChange={(e) => patch(s, { plan: e.target.value })}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select>
              <button className={btnQuiet} onClick={() => window.confirm(s.active ? `Suspend ${s.name}? Nobody there can sign in until you reactivate.` : `Reactivate ${s.name}?`) && patch(s, { active: !s.active })}>{s.active ? "Suspend" : "Reactivate"}</button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={create} className="max-w-sm space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Add a school</h2>
        <input className={field} required placeholder="School name" aria-label="School name" value={f.name} onChange={set("name")} />
        <input className={field} required placeholder="Web address, for example sunrise" aria-label="Web address" pattern="[a-z0-9-]{3,30}" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
        <input className={field} required placeholder="Admin's full name" aria-label="Admin name" value={f.adminName} onChange={set("adminName")} />
        <input className={field} required type="email" placeholder="Admin's email" aria-label="Admin email" value={f.adminEmail} onChange={set("adminEmail")} />
        <input className={field} required minLength={8} placeholder="Starting password" aria-label="Starting password" value={f.adminPassword} onChange={set("adminPassword")} />
        <button className={btn}>Create school</button>
        <p className="text-sm text-[#14213D]/70">Each school gets its own address, an admin login, Nursery 1 to Primary 5, default subjects, and a grading scale.</p>
      </form>
    </div>
  );
}
