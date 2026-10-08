import { createHmac, timingSafeEqual } from "crypto";

const KEY = () => process.env.PAYSTACK_SECRET_KEY!;

export async function initialize(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata?: object }) {
  const r = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: p.email, amount: p.amountKobo, reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata }),
  });
  const j = await r.json();
  if (!r.ok || !j.status) throw new Error(j.message ?? "Paystack initialize failed");
  return j.data as { authorization_url: string; reference: string };
}

/** Paystack signs the raw body with HMAC-SHA512 using your secret key. */
export function validSignature(raw: string, sig: string | null) {
  if (!sig) return false;
  const a = Buffer.from(createHmac("sha512", KEY()).update(raw).digest("hex"));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
