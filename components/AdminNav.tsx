"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

const LINKS: [string, string, string[]][] = [
  ["/admin/applications", "Admissions", ["ADMIN"]], ["/admin/students", "Students", ["ADMIN", "BURSAR"]],
  ["/admin/attendance", "Attendance", ["ADMIN", "TEACHER"]], ["/admin/scores", "Scores", ["ADMIN", "TEACHER"]],
  ["/admin/reports", "Report cards", ["ADMIN", "TEACHER"]], ["/admin/fees", "Fees", ["ADMIN", "BURSAR"]], ["/admin/subjects", "Subjects", ["ADMIN"]], ["/admin/staff", "Staff", ["ADMIN"]],
  ["/account", "Account", ["ADMIN", "BURSAR", "TEACHER"]],
];

export default function AdminNav() {
  const path = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("");
  useEffect(() => { api("/api/me").then((m) => setRole(m.role)).catch(() => {}); }, []);
  return (
    <nav className="-mx-4 mb-6 flex items-center gap-1 overflow-x-auto border-b border-[#14213D]/10 px-4 pb-2" aria-label="Staff">
      {LINKS.filter(([, , r]) => r.includes(role)).map(([href, label]) => (
        <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 ${path.startsWith(href) ? "bg-[var(--brand)] text-white" : ""}`}>{label}</Link>
      ))}
      <button className="ml-auto shrink-0 px-3 py-2 underline" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); }}>Sign out</button>
    </nav>
  );
}
