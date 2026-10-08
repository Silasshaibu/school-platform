"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, btn, field } from "@/lib/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { role } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (role === "SUPER_ADMIN") router.push("/platform");
      else if (role === "PARENT") router.push("/parent");
      else if (role === "ADMIN") router.push("/admin/applications");
      else if (role === "BURSAR") router.push("/admin/fees");
      else if (role === "TEACHER") router.push("/admin/attendance");
      else setError("Your account type has no screens yet.");
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-sm space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Sign in</h1>
      <label className="block">Email
        <input className={field} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block">Password
        <input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-[#B42318]">{error}</p>}
      <button className={btn + " w-full"} disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
    </form>
  );
}
