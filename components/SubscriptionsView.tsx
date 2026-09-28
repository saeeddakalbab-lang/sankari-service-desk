"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import { CURRENCIES, formatMoney, isRate, parseAmountToCents, toAedCents } from "@/lib/money";
import { COMPANIES } from "@/lib/companies";
import { DEPARTMENTS } from "@/lib/departments";
import type { SubscriptionRow } from "@/lib/subscriptions";

type Req = { id: string; ref: string; subject: string; company: string; requesterUserId: string; requester: string; service: string; amountCents: string; currency: string };
type Cost = { amount: string; currency: string; aedRate: string };
const CYCLES = ["monthly", "quarterly", "annual", "one_off"] as const;
const today = () => new Date().toISOString().slice(0, 10);
const centsText = (c: string | number) => (Number(c) / 100).toFixed(2);

// The actual charge: amount after tax, its currency, and the rate to AED (1 unit = rate AED), with the
// AED figure worked out live. AED needs no rate.
function CostFields({ id, value, onChange }: { id: string; value: Cost; onChange: (c: Cost) => void }) {
  const t = useT(), cents = parseAmountToCents(value.amount), aed = value.currency === "AED" ? cents : cents !== null && isRate(value.aedRate) ? toAedCents(cents, value.currency, value.aedRate) : null;
  return <>
    <div className="field"><label className="label" htmlFor={`${id}-amt`}>{t("subs.actualCost")}</label><input className="input mono" id={`${id}-amt`} dir="ltr" inputMode="decimal" required value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value.replace(/[^\d.]/g, "") })} aria-describedby={`${id}-aed`} /></div>
    <div className="field"><label className="label" htmlFor={`${id}-cur`}>{t("subs.currency")}</label><select className="select mono" id={`${id}-cur`} value={value.currency} onChange={e => onChange({ ...value, currency: e.target.value })}>{[...new Set([...CURRENCIES, value.currency])].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
    {value.currency !== "AED" && <div className="field"><label className="label" htmlFor={`${id}-rate`}>{t("subs.rateTo", { cur: value.currency })}</label><input className="input mono" id={`${id}-rate`} dir="ltr" inputMode="decimal" required value={value.aedRate} onChange={e => onChange({ ...value, aedRate: e.target.value.replace(/[^\d.]/g, "") })} aria-describedby={`${id}-aed`} /></div>}
    <p id={`${id}-aed`} className="hint" style={{ gridColumn: "1 / -1" }} aria-live="polite">{aed !== null ? t("subs.inAed", { aed: formatMoney(aed, "AED") }) : t("subs.inAedMissing")}</p>
  </>;
}
const costOk = (c: Cost) => parseAmountToCents(c.amount) !== null && (c.currency === "AED" || isRate(c.aedRate));

// Owners renew or decline here; admins also record subscriptions from approved requests and from phone approvals.
export function SubscriptionsView({ rows, admin, selfId, requests, people }: { rows: SubscriptionRow[]; admin: boolean; selfId: string; requests: Req[]; people: { id: string; name: string }[] }) {
  const t = useT(), locale = useLocale(), router = useRouter();
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<string | null>(null), [note, setNote] = useState("");
  const [renewing, setRenewing] = useState<string | null>(null), [renewCost, setRenewCost] = useState<Cost>({ amount: "", currency: "AED", aedRate: "" });
  const post = async (url: string, body: object) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); return d; };
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); setMsg({ id, ok: true, text: ok }); router.refresh(); return true; } catch (e) { setMsg({ id, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); } };
  const startRenew = (s: SubscriptionRow) => { setMsg(null); setDeclining(null); setRenewing(s.id); setRenewCost({ amount: centsText(s.amount_cents), currency: s.currency, aedRate: s.aed_rate ?? "" }); };
  const renew = async (s: SubscriptionRow) => { if (await run(s.id, () => post(`/api/subscriptions/${s.id}/renewal`, { decision: "renew", note: "", actual: renewCost }), t("subs.renewed"))) setRenewing(null); };
  const decline = async (s: SubscriptionRow) => { setBusy(true); try { const d = await post(`/api/subscriptions/${s.id}/renewal`, { decision: "decline", note }); setMsg({ id: s.id, ok: true, text: t("subs.declined", { date: d.renewalDate }) }); setDeclining(null); setNote(""); router.refresh(); } catch (e) { setMsg({ id: s.id, ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); } };
  const state = (s: SubscriptionRow) => s.status === "cancelled" ? ["neutral", t("subs.st.cancelled")] : s.status === "expired" ? ["neutral", t("subs.st.expired")]
    : s.open_flagged ? ["bad", t("subs.st.flagged", { date: s.open_renewal_date || "" })] : s.cancel_at ? ["neutral", t("subs.st.cancels", { date: s.cancel_at })]
    : s.open_renewal_id ? ["gold", t("subs.st.due", { date: s.open_renewal_date || "" })] : ["good", t("subs.st.active")];
  const Msg = ({ id }: { id: string }) => msg?.id === id ? <div className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null;

  // 1. From an approved request: the actual cost after tax is asked for here.
  const [beneficiary, setBeneficiary] = useState(""), [reqId, setReqId] = useState(""), [cycle, setCycle] = useState("annual"), [renewal, setRenewal] = useState(""), [owner, setOwner] = useState(""), [last4, setLast4] = useState(""), [provider, setProvider] = useState("");
  const [actual, setActual] = useState<Cost>({ amount: "", currency: "AED", aedRate: "" });
  const chosen = requests.find(r => r.id === reqId);
  const pickRequest = (id: string) => { setReqId(id); setOwner(""); const r = requests.find(x => x.id === id); if (r) setActual({ amount: centsText(r.amountCents), currency: r.currency, aedRate: "" }); };
  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run("add", () => post("/api/subscriptions", { requestId: reqId, cycle, renewalDate: cycle === "one_off" ? null : renewal, ownerUserId: owner || chosen?.requesterUserId, cardLast4: last4, provider, beneficiary, actual }), t("adm.saved"))) {
      setReqId(""); setRenewal(""); setLast4(""); setProvider(""); setBeneficiary(""); setActual({ amount: "", currency: "AED", aedRate: "" });
    }
  };

  // 2. Approved on a phone call: a new subscription, or a renewal of one already on the list.
  const blankPhone = { mode: "new" as "new" | "renewal", subscriptionId: "", name: "", provider: "", companyName: COMPANIES[0] as string, department: "", beneficiary: "", cycle: "annual", renewalDate: "", ownerUserId: selfId, cardLast4: "", approvedBy: "", approvedOn: today(), billedOn: today(), note: "" };
  const [ph, setPh] = useState(blankPhone), [phCost, setPhCost] = useState<Cost>({ amount: "", currency: "AED", aedRate: "" });
  const setP = (k: keyof typeof ph) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setPh({ ...ph, [k]: e.target.value });
  const renewable = rows.filter(r => r.billing_frequency !== "one_off" && r.status !== "cancelled");
  const pickRenewal = (id: string) => { const s = rows.find(r => r.id === id); setPh({ ...ph, subscriptionId: id }); if (s) setPhCost({ amount: centsText(s.amount_cents), currency: s.currency, aedRate: s.aed_rate ?? "" }); };
  const recordPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const common = { approvedBy: ph.approvedBy, approvedOn: ph.approvedOn, billedOn: ph.billedOn, note: ph.note, actual: phCost };
    const body = ph.mode === "renewal" ? { mode: "renewal", subscriptionId: ph.subscriptionId, ...common }
      : { mode: "new", name: ph.name, provider: ph.provider, companyName: ph.companyName, department: ph.department, beneficiary: ph.beneficiary, cycle: ph.cycle, renewalDate: ph.cycle === "one_off" ? null : ph.renewalDate, ownerUserId: ph.ownerUserId, cardLast4: ph.cardLast4, ...common };
    if (await run("phone", () => post("/api/subscriptions/phone", body), t("subs.phoneSaved"))) { setPh(blankPhone); setPhCost({ amount: "", currency: "AED", aedRate: "" }); }
  };
  const phoneReady = ph.approvedBy.trim().length >= 2 && costOk(phCost) && (ph.mode === "renewal" ? !!ph.subscriptionId : ph.name.trim().length >= 2 && !!ph.department && (ph.cycle === "one_off" || !!ph.renewalDate));

  return <div className="stack">
    <section className="card" aria-labelledby="subs-h">
      <div className="card-head"><h2 id="subs-h">{t("subs.title")}</h2></div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("subs.tool")}</th><th scope="col">{t("subs.beneficiary")}</th><th scope="col">{t("subs.company")}</th><th scope="col">{t("subs.cost")}</th><th scope="col">{t("subs.renews")}</th>{admin && <th scope="col">{t("subs.owner")}</th>}<th scope="col">{t("subs.card")}</th><th scope="col">{t("subs.state")}</th></tr></thead>
        <tbody>{rows.map(s => { const [tone, label] = state(s), mine = s.owner_user_id === selfId && !!s.open_renewal_id; return <tr key={s.id}>
          <td><strong style={{ fontWeight: 600 }}>{s.name}</strong>{s.request_ref && <><br /><Link className="ref" href={`/requests/${s.request_id}`} dir="ltr">{s.request_ref}</Link></>}</td>
          <td>{s.beneficiary || "—"}</td>
          <td>{s.company_name || "—"}</td>
          <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(s.amount_cents, s.currency)}{s.currency !== "AED" && s.aed_rate && <><br /><span className="soft" style={{ fontSize: 12 }}>≈ {formatMoney(toAedCents(BigInt(s.amount_cents), s.currency, s.aed_rate), "AED")}</span></>}<br /><span className="soft" style={{ fontFamily: "var(--f-body)", fontSize: 13 }}>{t(`cycle.${s.billing_frequency}` as I18nKey)}</span></td>
          <td className="mono" dir="ltr">{s.renewal_date || "—"}</td>
          {admin && <td>{s.owner_name || "—"}</td>}
          <td className="mono" dir="ltr">{s.card_last4 ? `•••• ${s.card_last4}` : "—"}</td>
          <td className="stack-s"><span className={`pill ${tone}`}>{label}</span>
            {mine && declining !== s.id && renewing !== s.id && <div className="row"><button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => startRenew(s)}>{t("subs.renew")}</button><button type="button" className="btn btn-bad btn-small" disabled={busy} onClick={() => { setRenewing(null); setDeclining(s.id); setNote(""); }}>{t("subs.decline")}</button></div>}
            {mine && renewing === s.id && <form className="stack-s" onSubmit={e => { e.preventDefault(); renew(s); }} aria-label={t("subs.renew")}>
              <p className="soft" style={{ fontSize: 13 }}>{t("subs.renewHint")}</p>
              <div className="grid-2" style={{ gap: 10 }}><CostFields id={`rn-${s.id}`} value={renewCost} onChange={setRenewCost} /></div>
              <div className="row"><button type="submit" className="btn btn-primary btn-small" disabled={busy || !costOk(renewCost)}>{t("subs.confirmRenewBtn")}</button><button type="button" className="btn btn-small" onClick={() => setRenewing(null)}>{t("subs.cancel")}</button></div></form>}
            {mine && declining === s.id && <div className="stack-s"><label className="label" htmlFor={`note-${s.id}`}>{t("subs.declineNote")}</label><textarea className="textarea" id={`note-${s.id}`} rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
              <div className="row"><button type="button" className="btn btn-bad btn-small" disabled={busy} onClick={() => decline(s)}>{t("subs.confirmDecline")}</button><button type="button" className="btn btn-small" onClick={() => setDeclining(null)}>{t("subs.cancel")}</button></div></div>}
            <Msg id={s.id} /></td>
        </tr>; })}</tbody>
      </table></div> : <p className="card-pad soft">{t(admin ? "subs.noneAdmin" : "subs.none")}</p>}
    </section>

    {admin && <form className="card card-pad stack" aria-labelledby="add-sub-h" onSubmit={record}>
      <div className="stack-s"><h2 id="add-sub-h">{t("subs.add")}</h2><p className="soft" style={{ fontSize: 14 }}>{t("subs.addLead")}</p></div>
      {requests.length ? <>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="s-req">{t("subs.request")}</label><select className="select" id="s-req" required value={reqId} onChange={e => pickRequest(e.target.value)}><option value="">{t("subs.pickRequest")}</option>{requests.map(r => <option key={r.id} value={r.id}>{r.ref} · {r.service} · {formatMoney(r.amountCents, r.currency)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="s-owner">{t("subs.owner")}</label><select className="select" id="s-owner" value={owner || chosen?.requesterUserId || ""} onChange={e => setOwner(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        {chosen && <fieldset className="stack-s" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
          <legend className="label" style={{ padding: "0 6px" }}>{t("subs.actualLegend")}</legend>
          <p className="soft" style={{ fontSize: 13 }}>{t("subs.actualHint", { quoted: formatMoney(chosen.amountCents, chosen.currency) })}</p>
          <div className="grid-3"><CostFields id="s-cost" value={actual} onChange={setActual} /></div>
        </fieldset>}
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="s-cycle">{t("subs.cycle")}</label><select className="select" id="s-cycle" value={cycle} onChange={e => setCycle(e.target.value)}>{CYCLES.map(c => <option key={c} value={c}>{t(`cycle.${c}` as I18nKey)}</option>)}</select></div>
          {cycle !== "one_off" && <div className="field"><label className="label" htmlFor="s-renew">{t("subs.renewalDate")}</label><input className="input mono" id="s-renew" type="date" required value={renewal} onChange={e => setRenewal(e.target.value)} /></div>}
          <div className="field"><label className="label" htmlFor="s-last4">{t("subs.last4")} <span className="opt">· {t("form.optional")}</span></label><input className="input mono" id="s-last4" inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" dir="ltr" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-describedby="s-last4-hint" /><span id="s-last4-hint" className="hint">{t("subs.last4Hint")}</span></div>
          <div className="field"><label className="label" htmlFor="s-ben">{t("subs.beneficiary")}</label><input className="input" id="s-ben" maxLength={160} placeholder={chosen?.requester || ""} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} aria-describedby="s-ben-hint" /><span id="s-ben-hint" className="hint">{t("subs.beneficiaryHint")}</span></div>
          <div className="field"><label className="label" htmlFor="s-prov">{t("subs.provider")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="s-prov" maxLength={120} value={provider} onChange={e => setProvider(e.target.value)} /></div>
        </div>
        <Msg id="add" />
        <div><button type="submit" className="btn btn-primary" disabled={busy || !reqId || (cycle !== "one_off" && !renewal) || !costOk(actual)}>{t("subs.addBtn")}</button></div>
      </> : <p className="soft">{t("subs.noRequests")}</p>}
    </form>}

    {admin && <form className="card card-pad stack" aria-labelledby="phone-h" onSubmit={recordPhone}>
      <div className="stack-s"><h2 id="phone-h">{t("subs.phoneTitle")}</h2><p className="soft" style={{ fontSize: 14 }}>{t("subs.phoneLead")}</p></div>
      <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">{t("subs.phoneTitle")}</legend>
        {(["new", "renewal"] as const).map(m => <label key={m} className="choice compact"><input type="radio" name="ph-mode" checked={ph.mode === m} onChange={() => setPh({ ...ph, mode: m })} />{t(m === "new" ? "subs.phoneNew" : "subs.phoneRenewal")}</label>)}
      </fieldset>
      {ph.mode === "renewal"
        ? <div className="field"><label className="label" htmlFor="ph-sub">{t("subs.phonePick")}</label><select className="select" id="ph-sub" required value={ph.subscriptionId} onChange={e => pickRenewal(e.target.value)}><option value="">{t("subs.pickRequest")}</option>{renewable.map(s => <option key={s.id} value={s.id}>{s.name} · {s.company_name} · {formatMoney(s.amount_cents, s.currency)} · {s.renewal_date ?? "—"}</option>)}</select></div>
        : <div className="grid-2">
          <div className="field"><label className="label" htmlFor="ph-name">{t("subs.tool")}</label><input className="input" id="ph-name" required maxLength={160} value={ph.name} onChange={setP("name")} /></div>
          <div className="field"><label className="label" htmlFor="ph-prov">{t("subs.provider")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="ph-prov" maxLength={120} value={ph.provider} onChange={setP("provider")} /></div>
          <div className="field"><label className="label" htmlFor="ph-co">{t("subs.company")}</label><select className="select" id="ph-co" value={ph.companyName} onChange={setP("companyName")}>{COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="ph-dep">{t("form.department")}</label><select className="select" id="ph-dep" required value={ph.department} onChange={setP("department")}><option value="" disabled>{t("form.pickDepartment")}</option>{DEPARTMENTS.map(d => <option key={d.en} value={d.en}>{d[locale]}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="ph-ben">{t("subs.beneficiary")}</label><input className="input" id="ph-ben" list="ph-people" maxLength={160} value={ph.beneficiary} onChange={setP("beneficiary")} /><datalist id="ph-people">{people.map(p => <option key={p.id} value={p.name} />)}</datalist></div>
          <div className="field"><label className="label" htmlFor="ph-owner">{t("subs.owner")}</label><select className="select" id="ph-owner" value={ph.ownerUserId} onChange={setP("ownerUserId")}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="ph-cycle">{t("subs.cycle")}</label><select className="select" id="ph-cycle" value={ph.cycle} onChange={setP("cycle")}>{CYCLES.map(c => <option key={c} value={c}>{t(`cycle.${c}` as I18nKey)}</option>)}</select></div>
          {ph.cycle !== "one_off" && <div className="field"><label className="label" htmlFor="ph-renew">{t("subs.renewalDate")}</label><input className="input mono" id="ph-renew" type="date" required value={ph.renewalDate} onChange={setP("renewalDate")} /></div>}
          <div className="field"><label className="label" htmlFor="ph-last4">{t("subs.last4")} <span className="opt">· {t("form.optional")}</span></label><input className="input mono" id="ph-last4" inputMode="numeric" autoComplete="off" maxLength={4} dir="ltr" value={ph.cardLast4} onChange={e => setPh({ ...ph, cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
        </div>}
      <fieldset className="stack-s" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
        <legend className="label" style={{ padding: "0 6px" }}>{t("subs.actualLegend")}</legend>
        <div className="grid-3"><CostFields id="ph-cost" value={phCost} onChange={setPhCost} /></div>
      </fieldset>
      <div className="grid-3">
        <div className="field"><label className="label" htmlFor="ph-by">{t("subs.phoneBy")}</label><input className="input" id="ph-by" list="ph-people" required minLength={2} maxLength={160} value={ph.approvedBy} onChange={setP("approvedBy")} /></div>
        <div className="field"><label className="label" htmlFor="ph-on">{t("subs.phoneOn")}</label><input className="input mono" id="ph-on" type="date" required max={today()} value={ph.approvedOn} onChange={setP("approvedOn")} /></div>
        <div className="field"><label className="label" htmlFor="ph-billed">{t("subs.billedOn")}</label><input className="input mono" id="ph-billed" type="date" required max={today()} value={ph.billedOn} onChange={setP("billedOn")} /></div>
      </div>
      <div className="field"><label className="label" htmlFor="ph-note">{t("subs.phoneNote")} <span className="opt">· {t("form.optional")}</span></label><textarea className="textarea" id="ph-note" rows={2} maxLength={2000} value={ph.note} onChange={setP("note")} /></div>
      <Msg id="phone" />
      <div><button type="submit" className="btn btn-primary" disabled={busy || !phoneReady}>{t("subs.phoneSave")}</button></div>
    </form>}
  </div>;
}
