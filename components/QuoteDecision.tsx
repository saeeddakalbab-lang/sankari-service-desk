"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// The client's answer to the quotation, on the public link. Bilingual: the client has no language
// setting. A decline may carry a reason; either answer is final.
export function QuoteDecision({ id, k }: { id: string; k: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "decline">(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async (decision: "accept" | "decline") => {
    if (decision === "accept" && !window.confirm("الموافقة على عرض السعر؟ · Accept this quotation?")) return;
    setBusy(true); setError("");
    try { const r = await fetch(`/api/c/${id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k, decision, note }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return <section className="card card-pad stack no-print" aria-labelledby="qd-h" style={{ maxWidth: 820, margin: "20px auto 0" }}>
    <h2 id="qd-h" style={{ fontSize: 17 }}>ردّكم على عرض السعر · Your answer</h2>
    <p className="soft" style={{ fontSize: 14 }}>بعد الموافقة نرسل إليكم العقد لتوقيعه من قبل شركتكم. · Once you accept, we send the contract for your company to sign.</p>
    {mode === "decline" ? <form className="stack-s" onSubmit={e => { e.preventDefault(); send("decline"); }}>
      <label className="label" htmlFor="qd-note">سبب الرفض (اختياري) · Reason (optional)</label>
      <textarea className="textarea" id="qd-note" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      <div className="row"><button type="submit" className="btn btn-bad" disabled={busy}>تأكيد الرفض · Decline</button><button type="button" className="btn" onClick={() => setMode("")}>رجوع · Back</button></div>
    </form> : <div className="row">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send("accept")}>الموافقة على العرض · Accept the quotation</button>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setMode("decline")}>رفض · Decline</button>
    </div>}
    {error && <div className="notice" role="alert">{error}</div>}
  </section>;
}
