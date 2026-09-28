import { createHmac, timingSafeEqual } from "node:crypto";

// The client has no account, so the contract and its invoices are shared by a link that carries an
// HMAC of the contract id. Nothing is stored; the link can't be guessed or pointed at another
// contract, and it only reads. Changing NEXTAUTH_SECRET invalidates every link already sent.
const secret = () => { const s = process.env.NEXTAUTH_SECRET; if (!s) throw new Error("NEXTAUTH_SECRET is not set"); return s; };
export const contractKey = (id: string) => createHmac("sha256", secret()).update(`contract-view:${id}`).digest("base64url").slice(0, 32);
export function validContractKey(id: string, key: string | undefined | null) {
  if (!key || !/^[0-9a-f-]{36}$/.test(id)) return false;
  const a = Buffer.from(contractKey(id)), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
export const contractLink = (id: string, invoiceId?: string) => {
  const u = new URL(`/c/${id}`, base());
  u.searchParams.set("k", contractKey(id));
  if (invoiceId) u.searchParams.set("invoice", invoiceId);
  return u.href;
};
