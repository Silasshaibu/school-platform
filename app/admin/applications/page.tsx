"use client";
import { useEffect, useState } from "react";
import { api, btn, btnQuiet } from "@/lib/client";
import { TRANSITIONS } from "@/lib/admissions";

type Stage = keyof typeof TRANSITIONS;
type App = { id: string; stage: Stage; childName: string; classWanted: string; parentName: string; parentPhone: string; assessmentScore: number | null };

const TABS: [Stage, string][] = [
  ["ENQUIRY", "Enquiries"], ["APPLIED", "Applied"], ["ASSESSED", "Assessed"], ["WAITLISTED", "Waitlist"],
  ["OFFERED", "Offered"], ["ACCEPTED", "Accepted"], ["ENROLLED", "Enrolled"], ["DECLINED", "Declined"],
];
const ACTION: Partial<Record<Stage, string>> = {
  APPLIED: "Mark as applied", ASSESSED: "Record assessment", WAITLISTED: "Add to waitlist",
  OFFERED: "Offer a place", ACCEPTED: "Mark as accepted", DECLINED: "Decline",
};

export default function Applications() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [tab, setTab] = useState<Stage>("APPLIED");
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState("");

  const load = () => api<App[]>("/api/applications").then(setApps).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function move(a: App, stage: Stage) {
    setError("");
    const body: any = { stage };
    if (stage === "ASSESSED") {
      const s = window.prompt(`Assessment score for ${a.childName} (0 to 100)`);
      if (s === null) return;
      if (!/^\d{1,3}$/.test(s) || Number(s) > 100) return setError("Enter a whole number from 0 to 100.");
      body.assessmentScore = Number(s);
    }
    try { await api("/api/applications/" + a.id, { method: "PATCH", body: JSON.stringify(body) }); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function enrol(a: App, gender: "M" | "F") {
    setError("");
    try { await api(`/api/applications/${a.id}/enroll`, { method: "POST", body: JSON.stringify({ gender }) }); setEnrolling(""); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  if (!apps) return <p role={error ? "alert" : undefined}>{error || "Loading applications"}</p>;
  const shown = apps.filter((a) => a.stage === tab);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Admissions</h1>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2" role="tablist">
        {TABS.map(([s, label]) => {
          const n = apps.filter((a) => a.stage === s).length;
          return (
            <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
              className={`shrink-0 rounded-full border px-4 py-2 ${tab === s ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[#14213D]/20 bg-white"}`}>
              {label} {n}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-[#B42318]">{error}</p>}
      {!shown.length && <p className="mt-6">Nobody at this stage. New applications from your school website land under Enquiries or Applied.</p>}
      <ul className="mt-4 divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
        {shown.map((a) => (
          <li key={a.id} className="space-y-2 px-4 py-4">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{a.childName}</p>
            <p>Applying for {a.classWanted}{a.assessmentScore !== null && `. Assessment score ${a.assessmentScore}`}</p>
            <p>{a.parentName}, <a className="underline" href={`tel:${a.parentPhone}`}>{a.parentPhone}</a></p>
            <div className="flex flex-wrap gap-2 pt-1">
              {TRANSITIONS[a.stage].map((to) => (
                <button key={to} className={to === "DECLINED" ? btnQuiet : btn} onClick={() => move(a, to)}>{ACTION[to]}</button>
              ))}
              {a.stage === "ACCEPTED" && enrolling !== a.id && <button className={btn} onClick={() => setEnrolling(a.id)}>Enrol student</button>}
            </div>
            {enrolling === a.id && (
              <div className="flex flex-wrap items-center gap-2">
                <span>Child is a</span>
                <button className={btnQuiet} onClick={() => enrol(a, "F")}>Girl</button>
                <button className={btnQuiet} onClick={() => enrol(a, "M")}>Boy</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
