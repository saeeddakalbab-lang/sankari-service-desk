"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { SubscriptionRow } from "@/lib/subscriptions";

type Req = { id: string; ref: string; subject: string; company: string; requesterUserId: string; requester: string; service: string; amountCents: string; currency: string };

// Owners renew or decline here; admins also record a subscription from an approved request.
export function SubscriptionsView({ rows, admin, selfId, requests, people }: { rows: SubscriptionRow[]; admin: boolean; selfId: string; requests: Req[]; people: { id: string; name: string }[] }) {
  const t = useT(), router = useRouter();
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<string | null>(null), [note, setNote] = useState("");
  const post = async (url: string, body: object) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); return d; };
  const decide = async (s: SubscriptionRow, decision: "renew" | "decline") => {
    if (decision === "renew" && !window.confirm(t("subs.confirmRenew", { tool: s.name, amount: formatMoney(s.amount_cents, s.currency) }))) return;
    setBusy(true);
    try { const d = await post(`/api/subscriptions/${s.id}/renewal`, { decision, note: decision === "decline" ? note : "" }); setMsg({ id: s.id, ok: true, text: decision === "renew" ? t("subs.renewed") : t("subs.declined", { date: d.renewalDate }) }); setDeclining(null); setNote(""); router.refresh(); }
    catch (e) { setMsg({ id: s.id, ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const state = (s: SubscriptionRow) => s.status === "cancelled" ? ["neutral", t("subs.st.cancelled")] : s.status === "expired" ? ["neutral", t("subs.st.expired")]
    : s.open_flagged ? ["bad", t("subs.st.flagged", { date: s.open_renewal_date || "" })] : s.cancel_at ? ["neutral", t("subs.st.cancels", { date: s.cancel_at })]
    : s.open_renewal_id ? ["gold", t("subs.st.due", { date: s.open_renewal_date || "" })] : ["good", t("subs.st.active")];

  // Record form (admin).
  const [beneficiary, setBeneficiary] = useState(""), [reqId, setReqId] = useState(""), [cycle, setCycle] = useState("annual"), [renewal, setRenewal] = useState(""), [owner, setOwner] = useState(""), [last4, setLast4] = useState(""), [provider, setProvider] = useState("");
  const chosen = requests.find(r => r.id === reqId);
  const record = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await post("/api/subscriptions", { requestId: reqId, cycle, renewalDate: cycle === "one_off" ? null : renewal, ownerUserId: owner || chosen?.requesterUserId, cardLast4: last4, provider, beneficiary }); setMsg({ id: "add", ok: true, text: t("adm.saved") }); setReqId(""); setRenewal(""); setLast4(""); setProvider(""); setBeneficiary(""); router.refresh(); }
    catch (err) { setMsg({ id: "add", ok: false, text: err instanceof Error ? err.message : String(err) }); } finally { setBusy(false); }
  };
  const Msg = ({ id }: { id: string }) => msg?.id === id ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;

  return <div className="stack">
    <section className="card" aria-labelledby="subs-h">
      <div className="card-head"><h2 id="subs-h">{t("subs.title")}</h2></div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("subs.tool")}</th><th scope="col">{t("subs.beneficiary")}</th><th scope="col">{t("subs.company")}</th><th scope="col">{t("subs.cost")}</th><th scope="col">{t("subs.renews")}</th>{admin && <th scope="col">{t("subs.owner")}</th>}<th scope="col">{t("subs.card")}</th><th scope="col">{t("subs.state")}</th></tr></thead>
        <tbody>{rows.map(s => { const [tone, label] = state(s), mine = s.owner_user_id === selfId && !!s.open_renewal_id; return <tr key={s.id}>
          <td><strong style={{ fontWeight: 600 }}>{s.name}</strong>{s.request_ref && <><br /><Link className="ref" href={`/requests/${s.request_id}`} dir="ltr">{s.request_ref}</Link></>}</td>
          <td>{s.beneficiary || "—"}</td>
          <td>{s.company_name || "—"}</td>
          <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(s.amount_cents, s.currency)}<br /><span className="soft" style={{ fontFamily: "var(--f-body)", fontSize: 13 }}>{t(`cycle.${s.billing_frequency}` as I18nKey)}</span></td>
          <td className="mono" dir="ltr">{s.renewal_date || "—"}</td>
          {admin && <td>{s.owner_name || "—"}</td>}
          <td className="mono" dir="ltr">{s.card_last4 ? `•••• ${s.card_last4}` : "—"}</td>
          <td className="stack-s"><span className={`pill ${tone}`}>{label}</span>
            {mine && declining !== s.id && <div className="row"><button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => decide(s, "renew")}>{t("subs.renew")}</button><button type="button" className="btn btn-bad btn-small" disabled={busy} onClick={() => { setDeclining(s.id); setNote(""); }}>{t("subs.decline")}</button></div>}
            {mine && declining === s.id && <div className="stack-s"><label className="label" htmlFor={`note-${s.id}`}>{t("subs.declineNote")}</label><textarea className="textarea" id={`note-${s.id}`} rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
              <div className="row"><button type="button" className="btn btn-bad btn-small" disabled={busy} onClick={() => decide(s, "decline")}>{t("subs.confirmDecline")}</button><button type="button" className="btn btn-small" onClick={() => setDeclining(null)}>{t("subs.cancel")}</button></div></div>}
            <Msg id={s.id} /></td>
        </tr>; })}</tbody>
      </table></div> : <p className="card-pad soft">{t("subs.none")}</p>}
    </section>

    {admin && <form className="card card-pad stack" aria-labelledby="add-sub-h" onSubmit={record}>
      <div className="stack-s"><h2 id="add-sub-h">{t("subs.add")}</h2><p className="soft" style={{ fontSize: 14 }}>{t("subs.addLead")}</p></div>
      {requests.length ? <>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="s-req">{t("subs.request")}</label><select className="select" id="s-req" required value={reqId} onChange={e => { setReqId(e.target.value); setOwner(""); }}><option value="">{t("subs.pickRequest")}</option>{requests.map(r => <option key={r.id} value={r.id}>{r.ref} · {r.service} · {formatMoney(r.amountCents, r.currency)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="s-owner">{t("subs.owner")}</label><select className="select" id="s-owner" value={owner || chosen?.requesterUserId || ""} onChange={e => setOwner(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="s-cycle">{t("subs.cycle")}</label><select className="select" id="s-cycle" value={cycle} onChange={e => setCycle(e.target.value)}>{["monthly", "quarterly", "annual", "one_off"].map(c => <option key={c} value={c}>{t(`cycle.${c}` as I18nKey)}</option>)}</select></div>
          {cycle !== "one_off" && <div className="field"><label className="label" htmlFor="s-renew">{t("subs.renewalDate")}</label><input className="input mono" id="s-renew" type="date" required value={renewal} onChange={e => setRenewal(e.target.value)} /></div>}
          <div className="field"><label className="label" htmlFor="s-last4">{t("subs.last4")} <span className="opt">· {t("form.optional")}</span></label><input className="input mono" id="s-last4" inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" dir="ltr" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-describedby="s-last4-hint" /><span id="s-last4-hint" className="hint">{t("subs.last4Hint")}</span></div>
          <div className="field"><label className="label" htmlFor="s-ben">{t("subs.beneficiary")}</label><input className="input" id="s-ben" maxLength={160} placeholder={chosen?.requester || ""} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} aria-describedby="s-ben-hint" /><span id="s-ben-hint" className="hint">{t("subs.beneficiaryHint")}</span></div>
          <div className="field"><label className="label" htmlFor="s-prov">{t("subs.provider")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="s-prov" maxLength={120} value={provider} onChange={e => setProvider(e.target.value)} /></div>
        </div>
        <Msg id="add" />
        <div><button type="submit" className="btn btn-primary" disabled={busy || !reqId || (cycle !== "one_off" && !renewal)}>{t("subs.addBtn")}</button></div>
      </> : <p className="soft">{t("subs.noRequests")}</p>}
    </form>}
  </div>;
}
