import type { ReactNode } from "react";
import AdminNav from "@/components/AdminNav";
export default function L({ children }: { children: ReactNode }) { return (<><AdminNav />{children}</>); }
