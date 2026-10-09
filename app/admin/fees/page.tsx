"use client";
import { useCallback, useEffect, useState } from "react";
import { api, naira, btn, btnQuiet, field } from "@/lib/client";

type Cls = { id: string; name: string; arm: string };
type Term = { id: string; name: string; current: boolean; year: { name: string } };
type Item = { id: string; name: string };
type Fee = { classId: string; feeItemId: string; amountKobo: number };
type Inv = { id: string; dueKobo: number; paidKobo: number; balanceKobo: number; student: { firstName: string; lastName: string; admissionNo: string } };

const h2 = "font-[family-name:var(--font-display)] text-xl font-semibold";

export default function Fees() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [termId, setTermId] = useState("");
  const [classes, setClasses] = useState<Cls[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [grid, setGrid] = useState<Record<string, string>>({}); // `${classId}:${itemId}` -> naira text
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [discount, setDiscount] = useState("0");
  const [withhold, setWithhold] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [nt, setNt] = useState({ yearName: "", name: "", startsOn: "", endsOn: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<unknown>, ok = "") => { setError(""); setMsg(""); try { await fn(); setMsg(ok); } catch (e) { setError((e as Error).message); } };

  const loadTerm = useCallback(async (id: string) => {
    const [fees, inv] = await Promise.all([api<Fee[]>(`/api/fees/structure?termId=${id}`), api<Inv[]>(`/api/invoices?termId=${id}`)]);
    setGrid(Object.fromEntries(fees.map((f) => [`${f.classId}:${f.feeItemId}`, String(f.amountKobo / 100)])));
    setInvoices(inv);
  }, []);

  useEffect(() => {
    run(async () => {
      const [t, c, i, s] = await Promise.all([api<Term[]>("/api/terms"), api<Cls[]>("/api/classes"), api<Item[]>("/api/fees/items"), api("/api/school")]);
      setTerms(t); setClasses(c); setItems(i); setDiscount(String(s.siblingDiscountPercent)); setWithhold(!!s.withholdReportsIfOwing);
      const cur = t.find((x) => x.current) ?? t[0];
      if (cur) { setTermId(cur.id); await loadTerm(cur.id); }
    });
  }, [loadTerm]);

  if (!terms) return <p role={error ? "alert" : undefined}>{error || "Loading fees"}</p>;

  if (!terms.length) return (
    <form className="max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/terms", { method: "POST", body: JSON.stringify(nt) }); location.reload(); }); }}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Set up your first term</h1>
      <input className={field} required placeholder="School year, for example 2026/2027" value={nt.yearName} onChange={(e) => setNt({ ...nt, yearName: e.target.value })} aria-label="School year" />
      <input className={field} required placeholder="Term name, for example First Term" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} aria-label="Term name" />
      <label className="block">Starts<input className={field} type="date" required value={nt.startsOn} onChange={(e) => setNt({ ...nt, startsOn: e.target.value })} /></label>
      <label className="block">Ends<input className={field} type="date" required value={nt.endsOn} onChange={(e) => setNt({ ...nt, endsOn: e.target.value })} /></label>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      <button className={btn}>Create term</button>
    </form>
  );

  const billed = invoices.reduce((s, i) => s + i.dueKobo, 0);
  const paid = invoices.reduce((s, i) => s + i.paidKobo, 0);
  const owing = invoices.filter((i) => i.balanceKobo > 0).sort((a, b) => b.balanceKobo - a.balanceKobo);

  const saveFees = () => run(async () => {
    for (const c of classes) {
      const rows = items.filter((it) => grid[`${c.id}:${it.id}`]?.trim()).map((it) => ({ feeItemId: it.id, amountKobo: Math.round(Number(grid[`${c.id}:${it.id}`]) * 100) }));
      if (rows.some((r) => !Number.isFinite(r.amountKobo) || r.amountKobo < 0)) throw new Error("Fees must be numbers, for example 45000.");
      if (rows.length) await api("/api/fees/structure", { method: "PUT", body: JSON.stringify({ termId, classId: c.id, items: rows }) });
    }
  }, "Fees saved.");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Fees</h1>
        <select className={field + " mt-3 sm:w-72"} value={termId} aria-label="Term" onChange={(e) => { setTermId(e.target.value); run(() => loadTerm(e.target.value)); }}>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.year.name}, {t.name}</option>)}
        </select>
        {error && <p role="alert" className="mt-3 text-[#B42318]">{error}</p>}
        {msg && <p role="status" className="mt-3 text-[#1F7A4D]">{msg}</p>}
      </div>

      <section className="space-y-3">
        <h2 className={h2}>What each class pays</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const it = await api("/api/fees/items", { method: "POST", body: JSON.stringify({ name: newItem }) }); setItems([...items, it]); setNewItem(""); }); }}>
          <input className={field} placeholder="Add a fee, for example Tuition" value={newItem} onChange={(e) => setNewItem(e.target.value)} aria-label="New fee name" />
          <button className={btnQuiet} disabled={newItem.trim().length < 2}>Add</button>
        </form>
        {items.length > 0 && (
          <div className="space-y-4">
            {classes.map((c) => (
              <fieldset key={c.id} className="border-t border-[#14213D]/10 pt-3">
                <legend className="font-medium">{c.name} {c.arm}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {items.map((it) => (
                    <label key={it.id} className="flex items-center justify-between gap-3">{it.name}
                      <input className={field + " w-36"} inputMode="decimal" placeholder="₦" value={grid[`${c.id}:${it.id}`] ?? ""} onChange={(e) => setGrid({ ...grid, [`${c.id}:${it.id}`]: e.target.value })} />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className={btn} onClick={saveFees}>Save fees</button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className={h2}>Invoices</h2>
        <label className="flex items-center gap-3">Sibling discount for the second child and beyond
          <input className={field + " w-20"} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} />%
          <button className={btnQuiet} onClick={() => run(() => api("/api/school", { method: "PATCH", body: JSON.stringify({ siblingDiscountPercent: Number(discount) }) }), "Discount saved.")}>Save</button>
        </label>
        <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={withhold} onChange={(e) => { setWithhold(e.target.checked); run(() => api("/api/school", { method: "PATCH", body: JSON.stringify({ withholdReportsIfOwing: e.target.checked }) }), "Setting saved."); }} />Hold report cards until the term's fees are paid</label>
        <button className={btn} onClick={() => run(async () => { const r = await api("/api/invoices/generate", { method: "POST", body: JSON.stringify({ termId }) }); await loadTerm(termId); setMsg(`${r.created} invoices created, ${r.skippedExisting} already existed${r.classesWithoutFees ? `, ${r.classesWithoutFees} students skipped because their class has no fees set` : ""}.`); })}>
          Generate invoices for this term
        </button>
      </section>

      {invoices.length > 0 && (
        <section className="space-y-3">
          <h2 className={h2}>Collections</h2>
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums">{naira(paid)} <span className="text-lg font-normal">collected of {naira(billed)}</span></p>
          <div className="h-2 overflow-hidden rounded-full bg-[#14213D]/10"><div className="h-full bg-[var(--brand)]" style={{ width: (billed ? Math.round((paid / billed) * 100) : 0) + "%" }} /></div>
          {owing.length === 0 ? <p>Every invoice is paid.</p> : (
            <ul className="divide-y divide-[#14213D]/10 border-y border-[#14213D]/10 bg-white">
              {owing.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span>{i.student.firstName} {i.student.lastName}<br /><span className="text-[#14213D]/70">{i.student.admissionNo}</span></span>
                  <span className="font-medium tabular-nums">{naira(i.balanceKobo)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
