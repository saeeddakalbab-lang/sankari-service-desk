"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Accounting, Statement } from "@/lib/statements";

const aed = (c: string) => formatMoney(c, "AED");

// The monthly statement: totals, lines, the two breakdowns, and the admin actions around the held email.
export function StatementView({ s, admin, today }: { s: Statement; admin: boolean; today: string }) {
  const t = useT(), router = useRouter();
  const [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const call = async (area: string, url: string, method: string, body?: object) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); setMsg({ area, ok: true, text: t("adm.saved") }); router.refresh(); return true; }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); }
  };
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;
  const [kind, setKind] = useState<"payment" | "refund">("payment"), [on, setOn] = useState(today), [amount, setAmount] = useState(""), [desc, setDesc] = useState("");
  const [acc, setAcc] = useState<Accounting>(s.accounting), [openingText, setOpeningText] = useState((Number(s.accounting.openingBalanceAedCents) / 100).toFixed(2));
  let bal = BigInt(s.openingAedCents);
  const st = s.stored;
  return <div className="stack">
    <div className="grid-4">
      {([["st2.opening", s.openingAedCents], ["st2.charges", s.chargesAedCents], ["st2.credits", s.creditsAedCents], ["st2.closing", s.closingAedCents]] as [I18nKey, string][]).map(([k, v]) =>
        <div key={k} className="card card-pad stat"><span className="soft" style={{ fontSize: 13 }}>{t(k)}</span><strong className="mono" dir="ltr" style={{ fontSize: 22 }}>{aed(v)}</strong></div>)}
    </div>

    {admin && <section className="card card-pad stack-s no-print" aria-labelledby="send-h">
      <h2 id="send-h" style={{ fontSize: 17 }}>{t("st2.send")}</h2>
      <p className="soft" style={{ fontSize: 14 }}>{st?.sentAt ? t("st2.sent", { to: st.recipient || "", who: st.sentBy || "", date: fmtDateTime(st.sentAt) }) : st ? t("st2.held", { to: st.recipient || "" }) : t("st2.notPrepared")}</p>
      <div className="row">
        {!st?.sentAt && <button type="button" className="btn btn-outline" disabled={busy || !s.accounting.recipientEmail} onClick={() => call("send", "/api/statements", "POST", { month: s.month })}>{t(st ? "st2.refresh" : "st2.generate")}</button>}
        {st && !st.sentAt && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { if (window.confirm(t("st2.confirmSend", { month: s.month, to: st.recipient || "" }))) call("send", `/api/statements/${s.month}/send`, "POST"); }}>{t("st2.send")}</button>}
        <a className="btn" href={`/api/statements/${s.month}/xlsx`} download>{t("st2.excel")}</a>
        <a className="btn" href={`/admin/statements/print?month=${s.month}`} target="_blank" rel="noreferrer">{t("st2.print")}</a>
      </div>
      <Msg area="send" />
    </section>}
    {!admin && <div className="row no-print"><a className="btn" href={`/api/statements/${s.month}/xlsx`} download>{t("st2.excel")}</a><a className="btn" href={`/admin/statements/print?month=${s.month}`} target="_blank" rel="noreferrer">{t("st2.print")}</a></div>}

    <section className="card" aria-labelledby="lines-h">
      <div className="card-head"><h2 id="lines-h">{t("st2.lines")} · {s.month}</h2><span className="soft mono">{s.lines.length}</span></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("st2.date")}</th><th scope="col">{t("st2.ref")}</th><th scope="col">{t("st2.service")}</th><th scope="col">{t("subs.beneficiary")}</th><th scope="col">{t("bills.company")}</th><th scope="col">{t("st2.original")}</th><th scope="col">{t("st2.debit")}</th><th scope="col">{t("st2.credit")}</th><th scope="col">{t("st2.balance")}</th><th scope="col">{t("st2.approvedBy")}</th></tr></thead>
        <tbody>
          <tr><td className="mono" dir="ltr">{s.month}-01</td><td /><td><strong>{t("st2.opening")}</strong></td><td /><td /><td /><td /><td /><td className="mono" dir="ltr">{aed(s.openingAedCents)}</td><td /></tr>
          {s.lines.map(l => { bal += BigInt(l.debitAedCents) - BigInt(l.creditAedCents); return <tr key={l.reference}>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{l.date}</td><td className="mono" dir="ltr" style={{ fontSize: 12 }}>{l.reference}</td>
            <td>{l.kind === "charge" ? l.service : <>{t(`st2.kind.${l.kind}` as I18nKey)}{l.service ? ` · ${l.service}` : ""}</>}</td><td>{l.beneficiary}</td><td>{l.company}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{l.original}</td>
            <td className="mono" dir="ltr">{l.debitAedCents !== "0" ? aed(l.debitAedCents) : ""}</td><td className="mono" dir="ltr">{l.creditAedCents !== "0" ? aed(l.creditAedCents) : ""}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed(bal.toString())}</td><td>{l.approvedBy}</td></tr>; })}
          <tr><td /><td /><td><strong>{t("st2.closing")}</strong></td><td /><td /><td /><td className="mono" dir="ltr"><strong>{aed(s.chargesAedCents)}</strong></td><td className="mono" dir="ltr"><strong>{aed(s.creditsAedCents)}</strong></td><td className="mono" dir="ltr"><strong>{aed(s.closingAedCents)}</strong></td><td /></tr>
        </tbody>
      </table></div>
      {!s.lines.length && <p className="card-pad soft">{t("st2.none")}</p>}
    </section>

    <div className="grid-2">
      {([["st2.byBeneficiary", s.byBeneficiary, "subs.beneficiary"], ["st2.byCompany", s.byCompany, "bills.company"]] as [I18nKey, Statement["byCompany"], I18nKey][]).map(([title, g, col]) =>
        <section key={title} className="card" aria-label={t(title)}><div className="card-head"><h2>{t(title)}</h2></div>
          {g.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t(col)}</th><th scope="col">{t("st2.count")}</th><th scope="col">{t("st2.total")}</th></tr></thead>
            <tbody>{g.map(x => <tr key={x.name}><td>{x.name}</td><td className="mono">{x.count}</td><td className="mono" dir="ltr">{aed(x.aedCents)}</td></tr>)}</tbody></table></div> : <p className="card-pad soft">{t("st2.none")}</p>}
        </section>)}
    </div>

    {admin && <div className="grid-2 no-print">
      <form className="card card-pad stack" aria-labelledby="credit-h" onSubmit={async e => { e.preventDefault(); if (await call("credit", "/api/statements/credits", "POST", { occurredOn: on, kind, amount, description: desc })) { setAmount(""); setDesc(""); } }}>
        <div className="stack-s"><h2 id="credit-h" style={{ fontSize: 17 }}>{t("st2.addCredit")}</h2><p className="soft" style={{ fontSize: 13 }}>{t("st2.appendOnly")}</p></div>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="c-kind">{t("st2.kind")}</label><select className="select" id="c-kind" value={kind} onChange={e => setKind(e.target.value as "payment" | "refund")}><option value="payment">{t("st2.kind.payment")}</option><option value="refund">{t("st2.kind.refund")}</option></select></div>
          <div className="field"><label className="label" htmlFor="c-date">{t("st2.date")}</label><input className="input mono" id="c-date" type="date" required value={on} onChange={e => setOn(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="c-amt">{t("st2.amount")}</label><input className="input mono" id="c-amt" dir="ltr" inputMode="decimal" required pattern="\d{1,12}(\.\d{1,2})?" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div className="field"><label className="label" htmlFor="c-desc">{t("st2.description")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="c-desc" maxLength={300} value={desc} onChange={e => setDesc(e.target.value)} /></div>
        </div>
        <Msg area="credit" />
        <div><button type="submit" className="btn btn-primary" disabled={busy || !amount}>{t("st2.addBtn")}</button></div>
      </form>
      <form className="card card-pad stack" aria-labelledby="acc-h" onSubmit={e => { e.preventDefault(); const m = /^(-?)(\d{1,13})(?:\.(\d{1,2}))?$/.exec(openingText.trim()); if (!m) { setMsg({ area: "acc", ok: false, text: t("st2.openingBal") }); return; } const cents = (BigInt(m[2]) * 100n + BigInt((m[3] || "").padEnd(2, "0"))) * (m[1] ? -1n : 1n); call("acc", "/api/admin/accounting", "PUT", { ...acc, openingBalanceAedCents: cents.toString() }); }}>
        <h2 id="acc-h" style={{ fontSize: 17 }}>{t("st2.settings")}</h2>
        <div className="field"><label className="label" htmlFor="a-mail">{t("st2.recipient")}</label><input className="input mono" id="a-mail" type="email" dir="ltr" value={acc.recipientEmail} onChange={e => setAcc({ ...acc, recipientEmail: e.target.value.trim() })} /></div>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="a-open">{t("st2.openingBal")}</label><input className="input mono" id="a-open" dir="ltr" inputMode="decimal" value={openingText} onChange={e => setOpeningText(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="a-month">{t("st2.openingMonth")}</label><input className="input mono" id="a-month" type="month" value={acc.openingMonth} onChange={e => setAcc({ ...acc, openingMonth: e.target.value })} /></div>
        </div>
        <Msg area="acc" />
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{t("st2.saveSettings")}</button></div>
      </form>
    </div>}
  </div>;
}
