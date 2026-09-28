"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

type Data = { flow: { month: string; inAedCents: string; outAedCents: string; netAedCents: string; runningAedCents: string }[]; lines: Record<string, any>[]; receivables: Record<string, any>[]; upcoming: Record<string, any>[]; margins: Record<string, any>[]; payables: Record<string, any>[]; estimatedLines: number };
const aed = (c: string) => formatMoney(c, "AED");
const dec = (c: string) => { const v = BigInt(c); return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`; };

// Outstanding receivables by company: export or email each company's list (or all) to the accounting
// address, and mark an invoice paid when the money reaches the account.
function Receivables({ rows, today, busy, post, Msg }: { rows: Record<string, any>[]; today: string; busy: boolean; post: (area: string, url: string, body: object) => Promise<boolean>; Msg: (p: { area: string }) => React.ReactNode }) {
  const t = useT(), [paid, setPaid] = useState<Record<string, { on: string; amount: string }>>({}), [open, setOpen] = useState<string | null>(null);
  const groups = [...rows.reduce<Map<string, Record<string, any>[]>>((m, r) => m.set(r.company_name, [...(m.get(r.company_name) ?? []), r]), new Map<string, Record<string, any>[]>())];
  const totals = (list: Record<string, any>[]) => Object.entries(list.reduce<Record<string, bigint>>((m, r) => ({ ...m, [r.currency]: (m[r.currency] ?? 0n) + BigInt(r.amount_cents) }), {})).map(([cur, v]) => formatMoney(v.toString(), cur)).join(" + ");
  const send = (company?: string) => { if (window.confirm(t("rc.confirmEmail", { who: company ?? t("rc.all") }))) post(`rc-${company ?? "all"}`, "/api/admin/receivables/email", company ? { company } : {}); };
  return <section className="card" aria-labelledby="lg-rec">
    <div className="card-head"><div className="stack-s" style={{ gap: 2 }}><h2 id="lg-rec">{t("lg.receivables")}</h2><span className="soft" style={{ fontSize: 13 }}>{t("rc.lead")}</span></div>
      {rows.length > 0 && <div className="row"><a className="btn btn-small" href="/api/admin/receivables/xlsx" download>{t("rc.exportAll")}</a><button type="button" className="btn btn-small btn-outline" disabled={busy} onClick={() => send()}>{t("rc.emailAll")}</button></div>}</div>
    <div className="card-pad" style={{ paddingTop: 0 }}><Msg area="rc-all" /></div>
    {groups.length ? groups.map(([company, list]) => <div key={company} className="rc-group">
      <div className="row rc-head" style={{ justifyContent: "space-between" }}>
        <div><strong>{company}</strong> <span className="soft">· {t("rc.count", { n: list.length })} · </span><strong className="mono" dir="ltr">{totals(list)}</strong></div>
        <div className="row"><a className="btn btn-small" href={`/api/admin/receivables/xlsx?company=${encodeURIComponent(company)}`} download>{t("rc.export")}</a><button type="button" className="btn btn-small btn-outline" disabled={busy} onClick={() => send(company)}>{t("rc.email")}</button></div>
      </div>
      <Msg area={`rc-${company}`} />
      <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t("ct.ref")}</th><th scope="col">{t("ct.amount")}</th><th scope="col">{t("rc.due")}</th><th scope="col">{t("lg.daysOpen")}</th><th scope="col"><span className="sr-only">{t("ct.markPaid")}</span></th></tr></thead>
        <tbody>{list.map(r => { const p = paid[r.id] ?? { on: today, amount: dec(r.amount_cents) }; return <tr key={r.id}>
          <td><Link className="ref" href={`/admin/contracts/${r.contract_id}`} dir="ltr">{r.reference}</Link><br /><span className="soft" style={{ fontSize: 12 }}>{t(`ct.inv.${r.installment}` as I18nKey)} · {r.share_bps / 100}%</span></td>
          <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(r.amount_cents, r.currency)}</td>
          <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{r.due_on}</td>
          <td><span className={`pill ${r.days_late > 0 ? "bad" : "gold"}`}>{r.days_open}</span>{r.days_late > 0 && <span className="soft" style={{ fontSize: 12 }}> · {t("rc.late", { n: r.days_late })}</span>}</td>
          <td>{open === r.id ? <form className="row" onSubmit={async e => { e.preventDefault(); if (await post(`rc-${company}`, `/api/admin/invoices/${r.id}/paid`, { paidOn: p.on, amount: p.amount })) setOpen(null); }}>
            <label className="sr-only" htmlFor={`rp-on-${r.id}`}>{t("ct.paidOn")}</label><input className="input mono" style={{ width: 150 }} id={`rp-on-${r.id}`} type="date" max={today} required value={p.on} onChange={e => setPaid({ ...paid, [r.id]: { ...p, on: e.target.value } })} />
            <label className="sr-only" htmlFor={`rp-am-${r.id}`}>{t("ct.amount")}</label><input className="input mono" style={{ width: 120 }} id={`rp-am-${r.id}`} dir="ltr" required value={p.amount} onChange={e => setPaid({ ...paid, [r.id]: { ...p, amount: e.target.value } })} />
            <button type="submit" className="btn btn-good btn-small" disabled={busy}>{t("rc.confirmPaid")}</button><button type="button" className="btn btn-small" onClick={() => setOpen(null)}>{t("st2.cancel")}</button></form>
            : <button type="button" className="btn btn-small btn-good" onClick={() => setOpen(r.id)}>{t("rc.finish")}</button>}</td>
        </tr>; })}</tbody></table></div>
    </div>) : <p className="card-pad soft">{t("lg.noReceivables")}</p>}
  </section>;
}

export function LedgerView({ d, today }: { d: Data; today: string }) {
  const t = useT(), router = useRouter();
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null);
  const [p, setP] = useState({ source: "payroll", vendor: "", description: "", category: "", amount: "", currency: "USD", cycle: "monthly", nextDueDate: today });
  const post = async (area: string, url: string, body: object) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Request failed"); setMsg({ area, ok: true, text: t("adm.saved") }); router.refresh(); return true; }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); }
  };
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;
  const max = d.flow.reduce((m, f) => Math.max(m, Number(f.inAedCents), Number(f.outAedCents)), 1);
  return <div className="stack">
    {d.estimatedLines > 0 && <div className="notice">{t("lg.estimated", { n: d.estimatedLines })}</div>}
    <section className="card" aria-labelledby="lg-flow">
      <div className="card-head"><h2 id="lg-flow">{t("lg.flow")}</h2><a className="btn btn-small" href="/api/admin/ledger/csv" download>{t("lg.csv")}</a></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("lg.month")}</th><th scope="col">{t("lg.in")}</th><th scope="col">{t("lg.out")}</th><th scope="col">{t("lg.net")}</th><th scope="col">{t("lg.running")}</th><th scope="col"><span className="sr-only">{t("lg.in")} / {t("lg.out")}</span></th></tr></thead>
        <tbody>{d.flow.map(f => <tr key={f.month}>
          <td className="mono" dir="ltr">{f.month}</td><td className="mono" dir="ltr">{aed(f.inAedCents)}</td><td className="mono" dir="ltr">{aed(f.outAedCents)}</td>
          <td className="mono" dir="ltr" style={{ color: BigInt(f.netAedCents) < 0n ? "var(--bad-ink)" : "var(--good-ink)" }}>{aed(f.netAedCents)}</td><td className="mono" dir="ltr">{aed(f.runningAedCents)}</td>
          <td style={{ minWidth: 140 }} aria-hidden="true"><div className="ledger-bar in" style={{ width: `${Number(f.inAedCents) / max * 100}%` }} /><div className="ledger-bar out" style={{ width: `${Number(f.outAedCents) / max * 100}%` }} /></td>
        </tr>)}</tbody>
      </table></div>
      <p className="card-pad soft" style={{ fontSize: 13, paddingTop: 0 }}><span className="ledger-key in" aria-hidden="true" /> {t("lg.in")} · <span className="ledger-key out" aria-hidden="true" /> {t("lg.out")}</p>
    </section>

    <Receivables rows={d.receivables} today={today} busy={busy} post={post} Msg={Msg} />

    <div className="grid-2" style={{ alignItems: "start" }}>
      <section className="card" aria-labelledby="lg-up"><div className="card-head"><h2 id="lg-up">{t("lg.upcoming")}</h2></div>
        {d.upcoming.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t("lg.vendor")}</th><th scope="col">{t("lg.source")}</th><th scope="col">{t("ct.amount")}</th><th scope="col">{t("lg.nextDue")}</th></tr></thead>
          <tbody>{d.upcoming.map(u => <tr key={u.kind + u.id}><td>{u.label}{u.company ? <><br /><span className="soft" style={{ fontSize: 12 }}>{u.company}</span></> : null}</td><td>{t(`lg.src.${u.kind}` as I18nKey)}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(u.amount_cents, u.currency)}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{u.due}<br /><span className={`pill ${u.days <= 7 ? "gold" : "neutral"}`} style={{ fontFamily: "var(--f-body)" }}>{u.days <= 0 ? t("lg.today") : t("lg.inDays", { n: u.days })}</span></td></tr>)}</tbody></table></div> : <p className="card-pad soft">{t("lg.noUpcoming")}</p>}
      </section>
    </div>

    <section className="card" aria-labelledby="lg-mg"><div className="card-head"><h2 id="lg-mg">{t("lg.margins")}</h2></div>
      {d.margins.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t("ct.ref")}</th><th scope="col">{t("ct.company")}</th><th scope="col">{t("lg.revenue")}</th><th scope="col">{t("lg.cost")}</th><th scope="col">{t("lg.marginCol")}</th><th scope="col">{t("ct.received")}</th></tr></thead>
        <tbody>{d.margins.map(m => { const mg = BigInt(m.revenue_cents) - BigInt(m.cost_cents); return <tr key={m.id}><td><Link className="ref" href={`/admin/contracts/${m.id}`} dir="ltr">{m.reference}</Link></td><td>{m.company_name}</td>
          <td className="mono" dir="ltr">{formatMoney(m.revenue_cents, m.currency)}</td><td className="mono" dir="ltr">{formatMoney(m.cost_cents, m.currency)}</td>
          <td className="mono" dir="ltr" style={{ color: mg < 0n ? "var(--bad-ink)" : "var(--good-ink)" }}>{formatMoney(mg.toString(), m.currency)}{BigInt(m.revenue_cents) > 0n ? ` · ${Number(mg * 1000n / BigInt(m.revenue_cents)) / 10}%` : ""}</td>
          <td className="mono" dir="ltr">{formatMoney(m.received_cents, m.currency)}</td></tr>; })}</tbody></table></div> : <p className="card-pad soft">{t("ct.none")}</p>}
    </section>

    <div className="grid-2" style={{ alignItems: "start" }}>
      <section className="card" aria-labelledby="lg-pay"><div className="card-head"><h2 id="lg-pay">{t("lg.payables")}</h2></div>
        {d.payables.length ? <div className="table-wrap"><table className="table"><thead><tr><th scope="col">{t("lg.vendor")}</th><th scope="col">{t("ct.amount")}</th><th scope="col">{t("lg.nextDue")}</th><th scope="col"><span className="sr-only">{t("lg.pay")}</span></th></tr></thead>
          <tbody>{d.payables.map(x => <tr key={x.id}><td>{x.vendor}<br /><span className="soft" style={{ fontSize: 12 }}>{t(`lg.src.${x.source}` as I18nKey)}{x.description ? ` · ${x.description}` : ""}</span></td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(x.amount_cents, x.currency)}<br /><span className="soft" style={{ fontFamily: "var(--f-body)", fontSize: 12 }}>{t(`cycle.${x.cycle}` as I18nKey)}</span></td>
            <td className="mono" dir="ltr">{x.is_active ? x.next_due_date : "—"}</td>
            <td>{x.is_active && <button type="button" className="btn btn-small btn-outline" disabled={busy} onClick={() => post("pay", `/api/admin/payables/${x.id}/pay`, { paidOn: today })}>{t("lg.pay")}</button>}</td></tr>)}</tbody></table></div> : <p className="card-pad soft">—</p>}
        <div className="card-pad" style={{ paddingTop: 0 }}><Msg area="pay" /></div>
      </section>
      <form className="card card-pad stack" aria-labelledby="lg-add" onSubmit={async e => { e.preventDefault(); if (await post("add", "/api/admin/payables", p)) setP({ ...p, vendor: "", description: "", amount: "" }); }}>
        <h2 id="lg-add" style={{ fontSize: 17 }}>{t("lg.addPayable")}</h2>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="p-src">{t("lg.source")}</label><select className="select" id="p-src" value={p.source} onChange={e => setP({ ...p, source: e.target.value })}>{["payroll", "other", "tool_bill"].map(s => <option key={s} value={s}>{t(`lg.src.${s}` as I18nKey)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="p-ven">{t("lg.vendor")}</label><input className="input" id="p-ven" required minLength={2} value={p.vendor} onChange={e => setP({ ...p, vendor: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor="p-amt">{t("ct.amount")}</label><div className="row" style={{ flexWrap: "nowrap" }}><input className="input mono" id="p-amt" dir="ltr" required pattern="\d{1,12}(\.\d{1,2})?" value={p.amount} onChange={e => setP({ ...p, amount: e.target.value })} /><select className="select" style={{ width: 100 }} aria-label="Currency" value={p.currency} onChange={e => setP({ ...p, currency: e.target.value })}><option>USD</option><option>AED</option></select></div></div>
          <div className="field"><label className="label" htmlFor="p-cyc">{t("lg.cycle")}</label><select className="select" id="p-cyc" value={p.cycle} onChange={e => setP({ ...p, cycle: e.target.value })}>{["monthly", "quarterly", "annual", "one_off"].map(c => <option key={c} value={c}>{t(`cycle.${c}` as I18nKey)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="p-due">{t("lg.nextDue")}</label><input className="input mono" id="p-due" type="date" required value={p.nextDueDate} onChange={e => setP({ ...p, nextDueDate: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor="p-desc">{t("lg.description")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="p-desc" maxLength={300} value={p.description} onChange={e => setP({ ...p, description: e.target.value })} /></div>
        </div>
        <Msg area="add" />
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{t("lg.addBtn")}</button></div>
      </form>
    </div>

    <section className="card" aria-labelledby="lg-lines"><div className="card-head"><h2 id="lg-lines">{t("lg.lines")}</h2><span className="soft mono">{d.lines.length}</span></div>
      <div className="table-wrap" style={{ maxHeight: 520, overflow: "auto" }}><table className="table"><thead><tr><th scope="col">{t("st2.date")}</th><th scope="col">{t("lg.source")}</th><th scope="col">{t("lg.description")}</th><th scope="col">{t("ct.amount")}</th><th scope="col">AED</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i}><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{l.date}</td><td><span className={`pill ${l.direction === "in" ? "good" : "neutral"}`}>{l.direction === "in" ? t("lg.in") : t("lg.out")}</span> {t(`lg.src.${l.source === "tool_bill" && l.category === "subscription" ? "subscription" : l.source}` as I18nKey)}</td>
          <td>{l.description}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(l.amount_cents, l.currency)}</td><td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{aed(l.amount_aed_cents)}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
