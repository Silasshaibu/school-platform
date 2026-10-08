import { cookies } from "next/headers";
export async function POST() {
  (await cookies()).delete("session");
  return Response.json({ ok: true });
}
