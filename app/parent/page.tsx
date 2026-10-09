"use client";
import { useEffect, useState } from "react";
import { api, naira, btn, btnQuiet, field } from "@/lib/client";

type Inv = {
  id: string; studentId: string; termId: string; dueKobo: number; paidKobo: number; balanceKobo: number;
  student: { firstName: string; lastName: string }; term: { name: string };
};

export default function Parent() {
  const [invoices, setInvoices] = useState<Inv[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [partFor, setPartFor] = useState("");
  const [part, setPart] = useState("");

  useEffect(() => { api<Inv[]>("/api/parent/invoices").then(setInvoices).catch((e) => setError(e.message)); }, []);

  async function pay(inv: Inv, amountKobo?: number) {
    setBusyId(inv.id); setError("");
    try {
      const r = await api("/api/invoices/" + inv.id + "/pay", { method: "POST", body: JSON.stringify(amountKobo ? { amountKobo } : {}) });
      location.href = r.authorizationUrl;
    } catch (e) { setError((e as Error).message); setBusyId(""); }
  }

  if (!invoices) return <p role={error ? "alert" : undefined}>{error || "Loading fees"}</p>;
  if (!invoices.length)
    return (<><h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Fees</h1>
      <p className="mt-3">No fees yet. They appear here when the school issues invoices for the term.</p></>);

  return (
    <div className="space-y-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Fees</h1>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {invoices.map((i) => {
        const pct = Math.min(100, Math.round((i.paidKobo / i.dueKobo) * 100));
        const settled = i.balanceKobo === 0;
        return (
          <section key={i.id} className="border-t border-[#14213D]/15 pt-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{i.student.firstName} {i.student.lastName}</h2>
            <p className="text-[#14213D]/70">{i.term.name}</p>
            <a className="underline" href={`/report/${i.studentId}?termId=${i.termId}`}>View report card</a>
            <p className="mt-4 font-[family-name:var(--font-display)] text-5xl font-semibold tabular-nums">
              {settled ? "Paid in full" : naira(i.balanceKobo)}
            </p>
            {!settled && <p className="mt-1">still to pay of {naira(i.dueKobo)}</p>}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#14213D]/10" role="img" aria-label={`${pct}% paid`}>
              <div className="h-full bg-[var(--brand)]" style={{ width: pct + "%" }} />
            </div>
            {!settled && (
              <div className="mt-4 space-y-3">
                <button className={btn + " w-full sm:w-auto"} disabled={busyId === i.id} onClick={() => pay(i)}>
                  {busyId === i.id ? "Opening payment" : `Pay ${naira(i.balanceKobo)}`}
                </button>{" "}
                <button className={btnQuiet} onClick={() => setPartFor(partFor === i.id ? "" : i.id)}>Pay part</button>
                {partFor === i.id && (
                  <div className="flex gap-2">
                    <input className={field} inputMode="decimal" placeholder="Amount in naira (minimum 50)" value={part} onChange={(e) => setPart(e.target.value)} aria-label="Amount in naira" />
                    <button className={btn} disabled={!Number(part) || Number(part) < 50} onClick={() => pay(i, Math.round(Number(part) * 100))}>Pay</button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
