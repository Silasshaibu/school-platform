"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, btn, field } from "@/lib/client";

export default function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(setWho)
      .catch(() => setError("This link has expired or was already used. Ask the school office for a new one."));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, password }) });
      router.push("/parent");
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  if (!who) return <p role={error ? "alert" : undefined} className="mx-auto mt-6 max-w-sm">{error || "Checking your link"}</p>;
  return (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-sm space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Welcome, {who.name}</h1>
      <p>Choose a password to see your child's fees and results. You'll sign in with {who.email}.</p>
      <label className="block">Password (at least 8 characters)
        <input className={field} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      <button className={btn + " w-full"} disabled={busy}>{busy ? "Creating account" : "Create account"}</button>
    </form>
  );
}
