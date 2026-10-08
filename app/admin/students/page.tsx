"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Stu = { id: string; admissionNo: string; firstName: string; lastName: string; class: { name: string; arm: string } };
type Link = { relation: string; canPickup: boolean; guardian: { id: string; name: string; phone: string; email: string | null; userId: string | null } };

const waNumber = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? "234" + d.slice(1) : d; }; // assumes Nigerian numbers

export default function Students() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [list, setList] = useState<Stu[] | null>(null);
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState("");
  const [guardians, setGuardians] = useState<Link[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => { api<Cls[]>("/api/classes").then(setClasses).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api<Stu[]>(`/api/students?q=${encodeURIComponent(q)}${classId ? "&classId=" + classId : ""}`).then(setList).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, classId]);

  async function toggle(id: string) {
    if (open === id) return setOpen("");
    setOpen(id); setGuardians([]); setError("");
    try { setGuardians((await api(`/api/students/${id}`)).guardians); } catch (e) { setError((e as Error).message); }
  }
  async function invite(g: Link["guardian"]) {
    setError("");
    try {
      const email = emails[g.id]?.trim();
      if (!g.email && email) await api(`/api/guardians/${g.id}`, { method: "PATCH", body: JSON.stringify({ email }) });
      const r = await api(`/api/guardians/${g.id}/invite`, { method: "POST" });
      setLinks((l) => ({ ...l, [g.id]: r.link }));
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Students</h1>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className={field} placeholder="Search by name or admission number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
        <select className={field + " sm:w-48"} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.arm}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="mt-3 text-[#B42318]">{error}</p>}
      {list && !list.length && <p className="mt-6">No students found. Enrol accepted applicants from Admissions.</p>}
      <ul className="mt-4 divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
        {list?.map((s) => (
          <li key={s.id}>
            <button className="flex w-full items-baseline justify-between gap-3 px-4 py-4 text-left" aria-expanded={open === s.id} onClick={() => toggle(s.id)}>
              <span className="font-[family-name:var(--font-display)] text-lg font-semibold">{s.firstName} {s.lastName}</span>
              <span className="text-right text-[#14213D]/70">{s.class.name} {s.class.arm}<br />{s.admissionNo}</span>
            </button>
            {open === s.id && (
              <div className="space-y-4 border-t border-[#14213D]/10 px-4 py-4">
                {guardians.map(({ guardian: g, relation }) => (
                  <div key={g.id} className="space-y-2">
                    <p className="font-medium">{g.name} ({relation})</p>
                    <p><a className="underline" href={`tel:${g.phone}`}>{g.phone}</a>{g.email && `, ${g.email}`}</p>
                    {g.userId ? <p>Has a parent account.</p> : links[g.id] ? (
                      <div className="space-y-2">
                        <p className="break-all rounded-lg bg-[#14213D]/5 p-3 text-sm">{links[g.id]}</p>
                        <div className="flex flex-wrap gap-2">
                          <button className={btnQuiet} onClick={() => navigator.clipboard.writeText(links[g.id])}>Copy link</button>
                          <a className={btn} href={`https://wa.me/${waNumber(g.phone)}?text=${encodeURIComponent("Set up your school portal account here (link valid 7 days): " + links[g.id])}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {!g.email && <input className={field} type="email" placeholder="Parent's email address" value={emails[g.id] ?? ""} onChange={(e) => setEmails({ ...emails, [g.id]: e.target.value })} aria-label="Parent's email" />}
                        <button className={btn} onClick={() => invite(g)}>Create invite link</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
