import { NextRequest, NextResponse } from "next/server";

// acme.yourplatform.com -> x-school-slug: acme (client-sent value is always overwritten)
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const sub = host !== root && host.endsWith(root) ? host.slice(0, -(root.length + 1)).split(".")[0] : null;
  const h = new Headers(req.headers);
  if (sub && sub !== "www") h.set("x-school-slug", sub);
  else h.delete("x-school-slug");
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
