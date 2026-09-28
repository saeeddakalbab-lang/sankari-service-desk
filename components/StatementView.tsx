"use client";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { useLocale, useT } from "./I18n";
import { DEPARTMENTS } from "@/lib/departments";
import type { I18nKey } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Accounting, Statement, StatementLine } from "@/lib/statements";
import { COMPANIES } from "@/lib/companies";

const aed = (c: string) => formatMoney(c, "AED");

// The monthly statement: totals, lines, the two breakdowns, and the admin actions around the held email.
export function StatementView({ s, admin, today, people }: { s: Statement; admin: boolean; today: string; people: string[] }) {
  const t = useT(), locale = useLocale(), router = useRouter();
  const [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const call = async (area: string, url: string, method: string, body?: object) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); setMsg({ area, ok: true, text: t("adm.saved") }); router.refresh(); return true; }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); }
  };
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;
  const [kind, setKind] = useState<"payment" | "refund">("payment"), [on, setOn] = useState(today), [amount, setAmount] = useState(""), [desc, setDesc] = useState("");
  const [who, setWho] = useState(""), [co, setCo] = useState(""), [dep, setDep] = useState("");
  // The line being corrected, and its draft. Only while the statement is unsent and the line unlocked.
  const [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState({ kind: "payment" as "payment" | "refund", on: "", amount: "", desc: "", who: "", co: "", dep: "" });
  const canEdit = (l: StatementLine) => admin && !s.stored?.sentAt && !l.locked;
  const startEdit = (l: StatementLine) => { setMsg(null); setEditing(l.id); setDraft({ kind: l.kind === "refund" ? "refund" : "payment", on: l.date, amount: (Number(l.creditAedCents) / 100).toFixed(2), desc: l.description, who: l.beneficiary === "—" ? "" : l.beneficiary, co: l.company === "—" ? "" : l.company, dep: l.department === "—" ? "" : l.department }); };
  const saveEdit = async (l: StatementLine) => {
    const body = l.kind === "charge" ? { type: "charge", beneficiary: draft.who, companyName: draft.co } : { type: "credit", occurredOn: draft.on, kind: draft.kind, amount: draft.amount, description: draft.desc, beneficiary: draft.who, department: draft.dep, companyName: draft.co };
    if (await call("edit", `/api/statements/lines/${l.id}`, "PATCH", body)) setEditing(null);
  };
  const personField = (id: string, value: string, set: (v: string) => void) => <div className="field"><label className="label" htmlFor={id}>{t("st2.person")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id={id} list="st-people" maxLength={160} value={value} onChange={e => set(e.target.value)} /></div>;
  // The employee's section. Charges take it from their subscription, so only payments and refunds ask.
  const departmentField = (id: string, value: string, set: (v: string) => void) => <div className="field"><label className="label" htmlFor={id}>{t("st2.department")} <span className="opt">· {t("form.optional")}</span></label><select className="select" id={id} value={value} onChange={e => set(e.target.value)}><option value="">—</option>{DEPARTMENTS.map(d => <option key={d.en} value={d.en}>{d[locale]}</option>)}{value && !DEPARTMENTS.some(d => d.en === value) ? <option value={value}>{value}</option> : null}</select></div>;
  const depName = (v: string) => DEPARTMENTS.find(d => d.en === v)?.[locale] ?? v;
  // A wrong line goes, until the statement is sent. A reason is asked and kept with the copy in the audit log.
  const remove = (l: StatementLine) => { const reason = window.prompt(t("st2.deleteReason", { ref: l.reference })); if (reason === null) return; if (reason.trim().length < 3) { setMsg({ area: "edit", ok: false, text: t("st2.deleteReasonShort") }); return; } call("edit", `/api/statements/lines/${l.id}`, "DELETE", { type: l.kind === "charge" ? "charge" : "credit", reason }); };
  const companyField = (id: string, value: string, set: (v: string) => void) => <div className="field"><label className="label" htmlFor={id}>{t("bills.company")} <span className="opt">· {t("form.optional")}</span></label><select className="select" id={id} value={value} onChange={e => set(e.target.value)}><option value="">—</option>{COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}{value && !(COMPANIES as readonly string[]).includes(value) ? <option value={value}>{value}</option> : null}</select></div>;
  const [acc, setAcc] = useState<Accounting>(s.accounting), [openingText, setOpeningText] = useState((Number(s.accounting.openingBalanceAedCents) / 100).toFixed(2));
  let bal = BigInt(s.openingAedCents);
  const st = s.stored;
  return <div className="stack">
    <datalist id="st-people">{people.map(p => <option key={p} value={p} />)}</datalist>
    <div className="grid-4">
      {([["st2.opening", s.openingAedCents], ["st2.charges", s.chargesAedCents], ["st2.credits", s.creditsAedCents], ["st2.closing", s.closingAedCents]] as [I18nKey, string][]).map(([k, v]) =>
        <div key={k} className="tile"><span className="tile-label">{t(k)}</span><strong className="tile-num" dir="ltr" style={{ fontSize: 22, whiteSpace: "nowrap" }}>{aed(v)}</strong></div>)}
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
      <div className="card-head"><h2 id="lines-h">{t("st2.lines")} · {s.month} <span className="soft mono" style={{ fontSize: 13, fontWeight: 400 }} dir="ltr">{s.periodStart} → {s.periodEnd}</span></h2><span className="soft mono">{s.lines.length}</span></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("st2.date")}</th><th scope="col">{t("st2.ref")}</th><th scope="col">{t("st2.service")}</th><th scope="col">{t("subs.beneficiary")}</th><th scope="col">{t("st2.department")}</th><th scope="col">{t("bills.company")}</th><th scope="col">{t("st2.original")}</th><th scope="col">{t("st2.debit")}</th><th scope="col">{t("st2.credit")}</th><th scope="col">{t("st2.balance")}</th><th scope="col">{t("st2.approvedBy")}</th>{admin && <th scope="col"><span className="sr-only">{t("st2.edit")}</span></th>}</tr></thead>
        <tbody>
          <tr><td className="mono" dir="ltr">{s.periodStart}</td><td /><td><strong>{t("st2.opening")}</strong></td><td /><td /><td /><td /><td /><td /><td className="mono" dir="ltr">{aed(s.openingAedCents)}</td><td />{admin && <td />}</tr>
          {s.lines.map(l => { bal += BigInt(l.debitAedCents) - BigInt(l.creditAedCents); return <Fragment key={l.id}><tr>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{l.date}</td><td className="mono" dir="ltr" style={{ fontSize: 12 }}>{l.reference}</td>
            <td>{l.kind === "charge" ? l.service : <>{t(`st2.kind.${l.kind}` as I18nKey)}{l.service ? ` · ${l.service}` : ""}</>}</td><td>{l.beneficiary}</td><td>{depName(l.department)}</td><td>{l.company}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{l.original}</td>
            <td className="mono" dir="ltr">{l.debitAedCents !== "0" ? aed(l.debitAedCents) : ""}</td><td className="mono" dir="ltr">{l.creditAedCents !== "0" ? aed(l.creditAedCents) : ""}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed(bal.toString())}</td><td>{l.approvedBy}</td>
            {admin && <td className="no-print">{canEdit(l) ? <button type="button" className="btn btn-small" aria-expanded={editing === l.id} aria-label={`${t("st2.edit")} ${l.reference}`} onClick={() => editing === l.id ? setEditing(null) : startEdit(l)}>{t(editing === l.id ? "st2.cancel" : "st2.edit")}</button> : null}{canEdit(l) ? <button type="button" className="btn btn-small btn-bad" style={{ marginInlineStart: 6 }} disabled={busy} aria-label={`${t("st2.delete")} ${l.reference}`} onClick={() => remove(l)}>{t("st2.delete")}</button> : <span className="soft" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{t("st2.lockedLine")}</span>}</td>}</tr>
            {editing === l.id && <tr className="no-print"><td colSpan={12}>
              <form className="stack" onSubmit={e => { e.preventDefault(); saveEdit(l); }} aria-label={`${t("st2.edit")} ${l.reference}`}>
                <p className="soft" style={{ fontSize: 13 }}>{t(l.kind === "charge" ? "st2.editChargeHint" : "st2.editCreditHint")}</p>
                <div className="grid-3" style={{ alignItems: "end" }}>
                  {l.kind !== "charge" && <>
                    <div className="field"><label className="label" htmlFor={`e-kind-${l.id}`}>{t("st2.kind")}</label><select className="select" id={`e-kind-${l.id}`} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as "payment" | "refund" })}><option value="payment">{t("st2.kind.payment")}</option><option value="refund">{t("st2.kind.refund")}</option></select></div>
                    <div className="field"><label className="label" htmlFor={`e-date-${l.id}`}>{t("st2.date")}</label><input className="input mono" id={`e-date-${l.id}`} type="date" required value={draft.on} onChange={e => setDraft({ ...draft, on: e.target.value })} /></div>
                    <div className="field"><label className="label" htmlFor={`e-amt-${l.id}`}>{t("st2.amount")}</label><input className="input mono" id={`e-amt-${l.id}`} dir="ltr" inputMode="decimal" required pattern="\d{1,12}(\.\d{1,2})?" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value.replace(/[^\d.]/g, "") })} /></div>
                    <div className="field"><label className="label" htmlFor={`e-desc-${l.id}`}>{t("st2.description")}</label><input className="input" id={`e-desc-${l.id}`} maxLength={300} value={draft.desc} onChange={e => setDraft({ ...draft, desc: e.target.value })} /></div>
                  </>}
                  {personField(`e-who-${l.id}`, draft.who, v => setDraft({ ...draft, who: v }))}
                  {l.kind !== "charge" && departmentField(`e-dep-${l.id}`, draft.dep, v => setDraft({ ...draft, dep: v }))}
                  {companyField(`e-co-${l.id}`, draft.co, v => setDraft({ ...draft, co: v }))}
                </div>
                <div className="row"><button type="submit" className="btn btn-primary" disabled={busy}>{t("st2.saveLine")}</button><button type="button" className="btn" onClick={() => setEditing(null)}>{t("st2.cancel")}</button></div>
                <Msg area="edit" />
              </form></td></tr>}
          </Fragment>; })}
          <tr><td /><td /><td><strong>{t("st2.closing")}</strong></td><td /><td /><td /><td /><td className="mono" dir="ltr"><strong>{aed(s.chargesAedCents)}</strong></td><td className="mono" dir="ltr"><strong>{aed(s.creditsAedCents)}</strong></td><td className="mono" dir="ltr"><strong>{aed(s.closingAedCents)}</strong></td><td />{admin && <td />}</tr>
        </tbody>
      </table></div>
      {!s.lines.length && <p className="card-pad soft">{t("st2.none")}</p>}
    </section>

    <div className="grid-2">
      {([["st2.byBeneficiary", s.byBeneficiary, "subs.beneficiary"], ["st2.byDepartment", s.byDepartment.map(x => ({ ...x, name: depName(x.name) })), "st2.department"], ["st2.byCompany", s.byCompany, "bills.company"]] as [I18nKey, Statement["byCompany"], I18nKey][]).map(([title, g, col]) =>
        <section key={title} className="card" aria-label={t(title)}><div className="card-head"><h2>{t(title)}</h2></div>
          {g.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t(col)}</th><th scope="col">{t("st2.count")}</th><th scope="col">{t("st2.charges")}</th><th scope="col">{t("st2.credits")}</th><th scope="col">{t("st2.net")}</th></tr></thead>
            <tbody>{g.map(x => <tr key={x.name}><td>{x.name}</td><td className="mono">{x.count}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed(x.aedCents)}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed(x.creditsAedCents)}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed((BigInt(x.aedCents) - BigInt(x.creditsAedCents)).toString())}</td></tr>)}</tbody></table></div> : <p className="card-pad soft">{t("st2.none")}</p>}
        </section>)}
    </div>

    {admin && <div className="grid-2 no-print">
      <form className="card card-pad stack" aria-labelledby="credit-h" onSubmit={async e => { e.preventDefault(); if (await call("credit", "/api/statements/credits", "POST", { occurredOn: on, kind, amount, description: desc, beneficiary: who, department: dep, companyName: co })) { setAmount(""); setDesc(""); setWho(""); setCo(""); setDep(""); } }}>
        <div className="stack-s"><h2 id="credit-h" style={{ fontSize: 17 }}>{t("st2.addCredit")}</h2><p className="soft" style={{ fontSize: 13 }}>{t("st2.appendOnly")}</p></div>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="c-kind">{t("st2.kind")}</label><select className="select" id="c-kind" value={kind} onChange={e => setKind(e.target.value as "payment" | "refund")}><option value="payment">{t("st2.kind.payment")}</option><option value="refund">{t("st2.kind.refund")}</option></select></div>
          <div className="field"><label className="label" htmlFor="c-date">{t("st2.date")}</label><input className="input mono" id="c-date" type="date" required value={on} onChange={e => setOn(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="c-amt">{t("st2.amount")}</label><input className="input mono" id="c-amt" dir="ltr" inputMode="decimal" required pattern="\d{1,12}(\.\d{1,2})?" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div className="field"><label className="label" htmlFor="c-desc">{t("st2.description")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="c-desc" maxLength={300} value={desc} onChange={e => setDesc(e.target.value)} /></div>
          {personField("c-who", who, setWho)}
          {departmentField("c-dep", dep, setDep)}
          {companyField("c-co", co, setCo)}
        </div>
        <Msg area="credit" />
        <div><button type="submit" className="btn btn-primary" disabled={busy || !amount}>{t("st2.addBtn")}</button></div>
      </form>
      <form className="card card-pad stack" aria-labelledby="acc-h" onSubmit={e => { e.preventDefault(); const m = /^(-?)(\d{1,13})(?:\.(\d{1,2}))?$/.exec(openingText.trim()); if (!m) { setMsg({ area: "acc", ok: false, text: t("st2.openingBal") }); return; } const cents = (BigInt(m[2]) * 100n + BigInt((m[3] || "").padEnd(2, "0"))) * (m[1] ? -1n : 1n); call("acc", "/api/admin/accounting", "PUT", { ...acc, openingBalanceAedCents: cents.toString() }); }}>
        <h2 id="acc-h" style={{ fontSize: 17 }}>{t("st2.settings")}</h2>
        <div className="field"><label className="label" htmlFor="a-mail">{t("st2.recipient")}</label><input className="input mono" id="a-mail" type="email" dir="ltr" value={acc.recipientEmail} onChange={e => setAcc({ ...acc, recipientEmail: e.target.value.trim() })} /></div>
        <div className="grid-3">
          <div className="field"><label className="label" htmlFor="a-cycle">{t("st2.cycleDay")}</label><select className="select mono" id="a-cycle" value={acc.cycleDay} onChange={e => setAcc({ ...acc, cycleDay: Number(e.target.value) })} aria-describedby="a-cycle-h">{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="a-open">{t("st2.openingBal")}</label><input className="input mono" id="a-open" dir="ltr" inputMode="decimal" value={openingText} onChange={e => setOpeningText(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="a-month">{t("st2.openingMonth")}</label><input className="input mono" id="a-month" type="month" value={acc.openingMonth} onChange={e => setAcc({ ...acc, openingMonth: e.target.value })} /></div>
        </div>
        <span id="a-cycle-h" className="hint">{t(acc.cycleDay > 1 ? "st2.cycleHint" : "st2.cycleHintCalendar", { d: acc.cycleDay, e: acc.cycleDay - 1 })}</span>
        <Msg area="acc" />
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{t("st2.saveSettings")}</button></div>
      </form>
    </div>}
  </div>;
}
