import type { ReactNode } from "react";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { getSchool } from "@/lib/tenant";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

export async function generateMetadata() {
  const s = await getSchool();
  return { title: s?.name ?? "School portal" };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const s = await getSchool();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body
        style={{ ["--brand" as string]: s?.primaryColor ?? "#1d4ed8" }}
        className="min-h-screen bg-[#F7F8FA] font-[family-name:var(--font-body)] text-[#14213D] antialiased"
      >
        <header className="border-b border-[#14213D]/10 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            {s?.logoUrl ? <img src={s.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-[var(--brand)]" aria-hidden />}
            <span className="font-[family-name:var(--font-display)] text-lg font-semibold">{s?.name ?? "School portal"}</span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
