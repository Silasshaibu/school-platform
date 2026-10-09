export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (r.status === 401 && !path.startsWith("/api/auth")) { location.href = "/login"; throw new Error("Please sign in"); }
  if (!r.ok) throw new Error(data?.error ?? "Something went wrong. Try again.");
  return data as T;
}
export const naira = (kobo: number) => "₦" + (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });

export const btn =
  "rounded-lg bg-[var(--brand)] px-4 py-3 font-medium text-white transition-opacity disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";
export const btnQuiet =
  "rounded-lg border border-[#14213D]/20 bg-white px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";
export const field =
  "w-full rounded-lg border border-[#14213D]/25 bg-white px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]";
