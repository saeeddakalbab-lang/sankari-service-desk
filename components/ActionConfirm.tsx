"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/format";

type Ticket = { id: string; ref: string; subject: string; description: string; priority: string; status: string; requester: string; company: string; category: string; assetTag: string; assignee: string | null };
type Info = { state: "ok" | "invalid" | "expired" | "used" | "wrong_user" | "not_allowed" | "moot"; action?: "ticket.start" | "ticket.reject"; usedAt?: string | null; usedBy?: string | null; expiresAt?: string | null; ticket?: Ticket | null };

// Confirm page for a Start / Reject link from the new-ticket email.
export function ActionConfirm({ token, info }: { token: string; info: Info }) {
  const t = useT();
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<"start" | "reject" | null>(null);
  const reject = info.action === "ticket.reject", tk = info.ticket;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (reject && reason.trim().length < 3) { setError(t("act.reasonReq")); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/actions/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reject ? { reason } : {}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      setDone(reject ? "reject" : "start");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const blocked = info.state !== "ok" ? t(`act.${info.state}` as I18nKey, { who: info.usedBy || "", date: fmtDateTime(info.usedAt), status: tk ? t(`status.${tk.status}` as I18nKey) : "" }) : "";
  return <div className="stack" style={{ maxWidth: 720 }}>
    <div className="stack-s"><p className="eyebrow">{t("act.title")}</p><h1>{t(reject ? "act.rejectTitle" : "act.startTitle")}</h1></div>
    {tk && <section className="card card-pad stack-s" aria-labelledby="tk-h">
      <p className="row soft" style={{ fontSize: 14 }}><bdi className="mono" dir="ltr">{tk.ref}</bdi><span aria-hidden="true">·</span><span>{t(`status.${tk.status}` as I18nKey)}</span></p>
      <h2 id="tk-h">{tk.subject}</h2>
      <dl className="facts">
        <div><dt>{t("act.from")}</dt><dd style={{ fontFamily: "var(--f-body)" }}>{tk.requester} · {tk.company}</dd></div>
        <div><dt>{t("act.category")}</dt><dd style={{ fontFamily: "var(--f-body)" }}>{tk.category || "—"}</dd></div>
        <div><dt>{t("act.priority")}</dt><dd style={{ fontFamily: "var(--f-body)" }}>{t(`prio.${tk.priority}` as I18nKey)}</dd></div>
        <div><dt>{t("hd.asset")}</dt><dd className="mono" dir="ltr">{tk.assetTag || "—"}</dd></div>
      </dl>
      <p style={{ whiteSpace: "pre-wrap" }}>{tk.description}</p>
    </section>}
    {done ? <div className="success stack-s" role="status"><p>{t(done === "start" ? "act.doneStart" : "act.doneReject")}</p>{tk && <p><Link href={`/requests/${tk.id}`}>{t("act.openTicket")}</Link></p>}</div>
      : blocked ? <div className="notice stack-s" role="alert"><p>{blocked}</p><p><Link href={tk && info.state !== "not_allowed" ? `/requests/${tk.id}` : "/admin"}>{tk && info.state !== "not_allowed" ? t("act.openTicket") : t("act.toQueue")}</Link></p></div>
      : <form className="card card-pad stack" onSubmit={submit} noValidate>
        <p>{t(reject ? "act.rejectLead" : "act.startLead")}</p>
        {reject && <div className="field"><label className="label" htmlFor="reason">{t("act.reason")}</label>
          <textarea className="textarea" id="reason" rows={4} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} aria-required="true" aria-invalid={!!error} aria-describedby="reason-hint reason-err" />
          <span id="reason-hint" className="hint">{t("act.reasonHint")}</span></div>}
        <div id="reason-err">{error && <div className="notice" role="alert">{error}</div>}</div>
        <div className="row" style={{ alignItems: "center" }}>
          <button type="submit" className={`btn ${reject ? "btn-bad" : "btn-primary"}`} disabled={busy}>{t(reject ? "act.rejectBtn" : "act.startBtn")}</button>
          <span className="soft" style={{ fontSize: 13 }}>{t("act.nothing")} {info.expiresAt && t("act.once", { date: fmtDateTime(info.expiresAt) })}</span>
        </div>
      </form>}
  </div>;
}
