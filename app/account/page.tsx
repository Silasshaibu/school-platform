"use client";
import { useState } from "react";
import { api, btn, field } from "@/lib/client";

export default function Account() {
  const [current, setCurrent] = useState(""), [next, setNext] = useState("");
  const [msg, setMsg] = useState(""), [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(""); setError("");
    try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current, next }) }); setMsg("Password changed."); setCurrent(""); setNext(""); }
    catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={save} className="max-w-sm space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Change password</h1>
      <label className="block">Current password<input className={field} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="block">New password (at least 8 characters)<input className={field} type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} /></label>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      {msg && <p role="status" className="text-[#1F7A4D]">{msg}</p>}
      <button className={btn}>Change password</button>
    </form>
  );
}
