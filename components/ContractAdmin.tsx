"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { fmtDate, fmtDateTime } from "@/lib/format";

type Detail = { contract: Record<string, any>; lines: Record<string, any>[]; invoices: Record<string, any>[]; assignments: Record<string, any>[]; history: Record<string, any>[] };
const usd = (c: string | number) => { const v = BigInt(c); return `USD ${(v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(v % 100n).toString().padStart(2, "0")}`; };
const dec = (c: string) => { const v = BigInt(c); return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`; };
const tone: Record<string, string> = { pending: "neutral", sent: "gold", paid: "good", overdue: "bad", void: "neutral" };

// One contract: terms, the three invoices, the next step, team cost and history.
export function ContractAdmin({ d, admin, today }: { d: Detail; admin: boolean; today: string }) {
  const t = useT(), router = useRouter(), c = d.contract;
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState(""), [evidence, setEvidence] = useState(""), [start, setStart] = useState(c.requested_start_date > today ? c.requested_start_date : today), [mode, setMode] = useState<"" | "reject" | "cancel">("");
  const [paid, setPaid] = useState<Record<string, { on: string; amount: string }>>({});
  const [staff, setStaff] = useState({ staffName: "", serviceKey: d.lines[0]?.service_key ?? "", monthlyCost: "", startedOn: c.start_date ?? today });
  const post = async (area: string, url: string, body: object) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Request failed"); setMsg({ area, ok: true, text: t("adm.saved") }); setMode(""); router.refresh(); return true; }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); }
  };
  const act = (body: object) => post("act", `/api/admin/contracts/${c.id}`, body);
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;
  const cost = d.assignments.reduce((s, a) => s + BigInt(a.monthly_cost_cents), 0n) * BigInt(c.duration_months), revenue = BigInt(c.total_cents), margin = revenue - cost;
  const signingPaid = d.invoices.some(i => i.installment === "signing" && i.status === "paid");
  const s = c.status as string, open = !["completed", "rejected", "cancelled"].includes(s);

  return <div className="stack">
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <div className="stack-s">
        <p className="row soft" style={{ fontSize: 14 }}><Link href="/admin/contracts">{t("ct.title")}</Link><span aria-hidden="true">/</span><bdi className="mono" dir="ltr">{c.reference}</bdi></p>
        <h1>{c.company_name}</h1>
        <p><span className="pill info">{t(`ct.st.${s}` as I18nKey)}</span></p>
      </div>
      <a className="btn" href={`/admin/contracts/${c.id}/print`} target="_blank" rel="noreferrer">{t("ct.print")}</a>
    </div>

    <div className="grid-2" style={{ alignItems: "start" }}>
      <section className="card card-pad stack" aria-labelledby="ct-lines">
        <h2 id="ct-lines" style={{ fontSize: 17 }}>{t("ct.lines")}</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">{t("cr.service")}</th><th scope="col">{t("cr.hours")}</th><th scope="col">{t("ct.monthly")}</th><th scope="col">{t("ct.lineTotal")}</th></tr></thead>
          <tbody>{d.lines.map(l => <tr key={l.service_key}><td>{l.service_label}</td><td className="mono">{l.hours_per_month}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{usd(l.monthly_price_cents)}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{usd(l.line_total_cents)}</td></tr>)}</tbody>
        </table></div>
        <dl className="facts" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          <div><dt>{t("ct.subtotal")}</dt><dd dir="ltr">{usd(c.subtotal_cents)}</dd></div>
          <div><dt>{t("ct.premium")}</dt><dd dir="ltr">{usd(c.onsite_premium_cents)}</dd></div>
          <div><dt>{t("ct.total")}</dt><dd dir="ltr">{usd(c.total_cents)}</dd></div>
        </dl>
      </section>
      <section className="card card-pad stack-s" aria-labelledby="ct-client">
        <h2 id="ct-client" style={{ fontSize: 17 }}>{t("ct.client")}</h2>
        <p><strong>{c.contact_name}</strong> · <bdi className="mono" dir="ltr">{c.contact_email}</bdi> · <bdi className="mono" dir="ltr">{c.contact_phone}</bdi></p>
        <p className="soft">{t(c.support_type === "onsite" ? "cr.onsite" : "cr.remote")} · {c.duration_months} × {t("cycle.monthly")} · {t("ct.requestedStart")} <bdi className="mono" dir="ltr">{c.requested_start_date}</bdi></p>
        {c.start_date && <p>{t("ct.startEnd", { start: c.start_date, end: c.end_date })}</p>}
        <h3 style={{ fontSize: 15, marginTop: 8 }}>{t("ct.requirements")}</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{c.requirements}</p>
        {c.rejection_reason && <div className="notice">{c.rejection_reason}</div>}
        {c.signed_evidence && <p className="soft">✓ {c.signed_evidence}</p>}
      </section>
    </div>

    {d.invoices.length > 0 && <section className="card" aria-labelledby="ct-inv">
      <div className="card-head"><h2 id="ct-inv">{t("ct.invoices")}</h2></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("ct.ref")}</th><th scope="col">{t("ct.status")}</th><th scope="col">{t("ct.amount")}</th><th scope="col">{t("ct.due")}</th><th scope="col"><span className="sr-only">{t("ct.markPaid")}</span></th></tr></thead>
        <tbody>{d.invoices.map(i => { const p = paid[i.id] ?? { on: today, amount: dec(i.amount_cents) }; return <tr key={i.id}>
          <td><bdi className="mono" dir="ltr">{i.reference}</bdi><br /><span className="soft" style={{ fontSize: 13 }}>{t(`ct.inv.${i.installment}` as I18nKey)}</span></td>
          <td><span className={`pill ${tone[i.status] ?? "neutral"}`}>{t(`ct.inv.${i.status}` as I18nKey)}</span></td>
          <td className="mono" dir="ltr">{usd(i.amount_cents)}</td>
          <td className="mono" dir="ltr" style={{ fontSize: 13 }}>{i.paid_at ? `✓ ${fmtDate(i.paid_at)}` : i.sent_at ? fmtDate(i.sent_at) : i.due_date || i.due_trigger}</td>
          <td>{["sent", "overdue"].includes(i.status) && <form className="row" onSubmit={e => { e.preventDefault(); post(`inv-${i.id}`, `/api/admin/invoices/${i.id}/paid`, { paidOn: p.on, amount: p.amount }); }}>
            <label className="sr-only" htmlFor={`on-${i.id}`}>{t("ct.paidOn")}</label><input className="input mono" style={{ width: 150 }} id={`on-${i.id}`} type="date" max={today} value={p.on} onChange={e => setPaid({ ...paid, [i.id]: { ...p, on: e.target.value } })} />
            <label className="sr-only" htmlFor={`am-${i.id}`}>{t("ct.amount")}</label><input className="input mono" style={{ width: 120 }} id={`am-${i.id}`} dir="ltr" value={p.amount} onChange={e => setPaid({ ...paid, [i.id]: { ...p, amount: e.target.value } })} />
            <button type="submit" className="btn btn-good btn-small" disabled={busy}>{t("ct.markPaid")}</button>
            <a className="btn btn-small" href={`/admin/contracts/${c.id}/print?invoice=${i.id}`} target="_blank" rel="noreferrer">{t("ct.printInvoice")}</a>
          </form>}<Msg area={`inv-${i.id}`} /></td>
        </tr>; })}</tbody>
      </table></div>
    </section>}

    {admin && <section className="card card-pad stack" aria-labelledby="ct-next">
      <h2 id="ct-next" style={{ fontSize: 17 }}>{t("ct.next")}</h2>
      {s === "submitted" && <div><button type="button" className="btn btn-outline" disabled={busy} onClick={() => act({ action: "review" })}>{t("ct.review")}</button></div>}
      {(s === "submitted" || s === "under_review") && <div className="stack-s"><div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => act({ action: "approve" })}>{t("ct.approve")}</button><button type="button" className="btn btn-bad" disabled={busy} onClick={() => setMode("reject")}>{t("ct.reject")}</button></div><span className="hint">{t("ct.approveHint")}</span></div>}
      {s === "contract_sent" && <form className="stack-s" onSubmit={e => { e.preventDefault(); act({ action: "signed", evidence }); }}>
        <label className="label" htmlFor="ev">{t("ct.evidence")}</label><input className="input" id="ev" required minLength={3} value={evidence} onChange={e => setEvidence(e.target.value)} aria-describedby="ev-h" /><span id="ev-h" className="hint">{t("ct.evidenceHint")}</span>
        <div><button type="submit" className="btn btn-primary" disabled={busy || evidence.trim().length < 3}>{t("ct.signed")}</button></div></form>}
      {s === "signed" && <form className="stack-s" onSubmit={e => { e.preventDefault(); act({ action: "activate", startDate: start }); }}>
        <label className="label" htmlFor="sd">{t("ct.startDate")}</label><input className="input mono" style={{ maxWidth: 220 }} id="sd" type="date" required value={start} onChange={e => setStart(e.target.value)} aria-describedby="sd-h" /><span id="sd-h" className="hint">{t("ct.activateHint")}</span>
        <div><button type="submit" className="btn btn-primary" disabled={busy || !signingPaid}>{t("ct.activate")}</button></div></form>}
      {!open && <p className="soft">{t("ct.done")}</p>}
      {open && s !== "submitted" && s !== "under_review" && <div><button type="button" className="btn btn-small" onClick={() => setMode("cancel")}>{t("ct.cancel")}</button></div>}
      {mode && <form className="stack-s" onSubmit={e => { e.preventDefault(); act({ action: mode, reason }); }}>
        <label className="label" htmlFor="rs">{t("ct.reason")}</label><textarea className="textarea" id="rs" rows={3} required minLength={3} value={reason} onChange={e => setReason(e.target.value)} />
        <div className="row"><button type="submit" className="btn btn-bad" disabled={busy || reason.trim().length < 3}>{t(mode === "reject" ? "ct.reject" : "ct.cancel")}</button><button type="button" className="btn" onClick={() => setMode("")}>{t("subs.cancel")}</button></div></form>}
      <Msg area="act" />
    </section>}

    <section className="card card-pad stack" aria-labelledby="ct-team">
      <div className="row" style={{ justifyContent: "space-between" }}><h2 id="ct-team" style={{ fontSize: 17 }}>{t("ct.team")}</h2>
        <span className={`pill ${margin >= 0n ? "good" : "bad"}`}>{t("ct.margin", { amount: usd(margin.toString()), pct: revenue > 0n ? `${Number(margin * 1000n / revenue) / 10}%` : "—" })}</span></div>
      {d.assignments.length > 0 && <ul className="stack-s" style={{ margin: 0, paddingInlineStart: 18 }}>{d.assignments.map(a => <li key={a.id}>{a.staff} · {a.service_key} · <bdi className="mono" dir="ltr">{usd(a.monthly_cost_cents)}</bdi>/{t("cycle.monthly")} · {t("ct.from")} <bdi className="mono" dir="ltr">{a.started_on}</bdi></li>)}</ul>}
      {admin && <form className="grid-4" style={{ alignItems: "end" }} onSubmit={async e => { e.preventDefault(); if (await post("staff", `/api/admin/contracts/${c.id}/assignments`, staff)) setStaff({ ...staff, staffName: "", monthlyCost: "" }); }}>
        <div className="field"><label className="label" htmlFor="st-n">{t("ct.staff")}</label><input className="input" id="st-n" required minLength={2} value={staff.staffName} onChange={e => setStaff({ ...staff, staffName: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="st-s">{t("cr.service")}</label><select className="select" id="st-s" value={staff.serviceKey} onChange={e => setStaff({ ...staff, serviceKey: e.target.value })}>{d.lines.map(l => <option key={l.service_key} value={l.service_key}>{l.service_label}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="st-c">{t("ct.monthlyCost")}</label><input className="input mono" id="st-c" dir="ltr" required pattern="\d{1,10}(\.\d{1,2})?" value={staff.monthlyCost} onChange={e => setStaff({ ...staff, monthlyCost: e.target.value })} /></div>
        <div className="row" style={{ alignItems: "end" }}><div className="field" style={{ flex: 1 }}><label className="label" htmlFor="st-d">{t("ct.from")}</label><input className="input mono" id="st-d" type="date" required value={staff.startedOn} onChange={e => setStaff({ ...staff, startedOn: e.target.value })} /></div><button type="submit" className="btn btn-outline" disabled={busy}>{t("ct.addStaff")}</button></div>
      </form>}
      <Msg area="staff" />
    </section>

    <section className="card card-pad stack-s" aria-labelledby="ct-hist">
      <h2 id="ct-hist" style={{ fontSize: 17 }}>{t("ct.history")}</h2>
      <ol className="stack-s" style={{ margin: 0, paddingInlineStart: 18 }}>{d.history.map((h, k) => <li key={k}><bdi className="mono" dir="ltr" style={{ fontSize: 13 }}>{fmtDateTime(h.created_at)}</bdi> · <strong>{t(`ct.h.${h.action.replace("contract.", "")}` as I18nKey)}</strong>{h.actor ? ` · ${h.actor}` : ""}{h.after_data?.reason ? ` · ${h.after_data.reason}` : ""}{h.after_data?.evidence ? ` · ${h.after_data.evidence}` : ""}</li>)}</ol>
    </section>
  </div>;
}
