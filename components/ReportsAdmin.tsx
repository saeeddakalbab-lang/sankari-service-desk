"use client";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import type { ReportSettings } from "@/lib/reports";

type Person = { id: string; name: string; email: string };
const DAYS: I18nKey[] = ["rp.d0", "rp.d1", "rp.d2", "rp.d3", "rp.d4", "rp.d5", "rp.d6"];
const emailOk = (s: string) => /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(s);

// Reports: for each, the weekly and monthly switches, who it appears to come from, and who gets it.
// Preview and Excel show exactly what would be sent for the last week or month, without sending.
export function ReportsAdmin({ settings, people, periods }: { settings: ReportSettings; people: Person[]; periods: { weekly: string; monthly: string } }) {
  const t = useT();
  const [s, setS] = useState(settings), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<"it" | "dev", string>>({ it: "", dev: "" });
  const call = async (area: string, url: string, method: string, body: object, ok: string) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); if (method === "PUT") setS(d); setMsg({ area, ok: true, text: ok }); }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <p className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null;
  const set = (k: "it" | "dev", v: Partial<ReportSettings["it"]>) => setS({ ...s, [k]: { ...s[k], ...v } });
  const add = (k: "it" | "dev", email: string) => { const e = email.trim().toLowerCase(); if (!emailOk(e)) { setMsg({ area: k, ok: false, text: t("rp.badEmail") }); return; } if (!s[k].recipients.includes(e)) set(k, { recipients: [...s[k].recipients, e] }); setDraft({ ...draft, [k]: "" }); };
  const nameOf = (e: string) => people.find(p => p.email === e)?.name;

  const card = (k: "it" | "dev", title: I18nKey, lead: I18nKey) => <section className="card card-pad stack" aria-labelledby={`rp-${k}`}>
    <div className="stack-s"><h2 id={`rp-${k}`} style={{ fontSize: 18 }}>{t(title)}</h2><p className="soft" style={{ fontSize: 14 }}>{t(lead)}</p></div>
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{t("rp.when")}</legend>
      <div className="row">{(["weekly", "monthly"] as const).map(c => <label key={c} className="choice compact"><input type="checkbox" checked={s[k][c]} onChange={e => set(k, { [c]: e.target.checked })} />{t(c === "weekly" ? "rp.weekly" : "rp.monthly")}</label>)}</div></fieldset>
    <div className="field"><label className="label" htmlFor={`rp-${k}-from`}>{t("rp.sender")}</label>
      <select className="select" id={`rp-${k}-from`} value={s[k].senderUserId ?? ""} onChange={e => set(k, { senderUserId: e.target.value || null })} aria-describedby={`rp-${k}-from-h`}>
        <option value="">{t("rp.defaultSender")}</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.email}</option>)}</select>
      <span id={`rp-${k}-from-h`} className="hint">{t("rp.senderHint")}</span></div>
    <div className="field"><span className="label" id={`rp-${k}-to`}>{t("rp.recipients")}</span>
      {s[k].recipients.length ? <ul className="row" aria-labelledby={`rp-${k}-to`} style={{ listStyle: "none", margin: 0, padding: 0 }}>{s[k].recipients.map(e => <li key={e} className="pill neutral" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        {nameOf(e) ? <>{nameOf(e)} <bdi className="mono soft" style={{ fontWeight: 400 }}>{e}</bdi></> : <bdi className="mono">{e}</bdi>}
        <button type="button" className="btn btn-small" aria-label={`${t("rp.remove")} ${e}`} onClick={() => set(k, { recipients: s[k].recipients.filter(x => x !== e) })}>×</button></li>)}</ul> : <p className="soft" style={{ fontSize: 14 }}>{t("rp.noRecipients")}</p>}
      <div className="row" style={{ alignItems: "end" }}>
        <label className="sr-only" htmlFor={`rp-${k}-pick`}>{t("rp.addPerson")}</label>
        <select className="select" id={`rp-${k}-pick`} style={{ maxWidth: 280 }} value="" onChange={e => e.target.value && add(k, e.target.value)}><option value="">{t("rp.addPerson")}</option>{people.filter(p => !s[k].recipients.includes(p.email)).map(p => <option key={p.id} value={p.email}>{p.name}</option>)}</select>
        <label className="sr-only" htmlFor={`rp-${k}-mail`}>{t("rp.addEmail")}</label>
        <input className="input mono" id={`rp-${k}-mail`} type="email" dir="ltr" style={{ maxWidth: 280 }} placeholder={t("rp.addEmail")} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(k, draft[k]); } }} />
        <button type="button" className="btn btn-outline btn-small" disabled={!draft[k].trim()} onClick={() => add(k, draft[k])}>{t("rp.add")}</button>
      </div></div>
    <div className="stack-s" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      {(["weekly", "monthly"] as const).map(c => <div key={c} className="row" style={{ alignItems: "center" }}>
        <span style={{ minWidth: 190 }}><strong>{t(c === "weekly" ? "rp.lastWeek" : "rp.lastMonth")}</strong> <span className="soft mono" style={{ fontSize: 13 }}>{periods[c]}</span></span>
        <a className="btn btn-small" href={`/api/admin/reports/preview?kind=${k}&cadence=${c}`} target="_blank" rel="noreferrer">{t("rp.preview")}</a>
        <a className="btn btn-small" href={`/api/admin/reports/xlsx?kind=${k}&cadence=${c}`} download>Excel</a>
        <button type="button" className="btn btn-small btn-outline" disabled={busy || !s[k].recipients.length} onClick={() => { if (window.confirm(t("rp.confirmSend", { n: s[k].recipients.length }))) call(k, "/api/admin/reports/send", "POST", { kind: k, cadence: c }, t("rp.sent")); }}>{t("rp.sendNow")}</button>
      </div>)}
      <span className="hint">{t("rp.sendHint")}</span>
    </div>
    <Msg area={k} />
  </section>;

  return <div className="stack">
    <div className="grid-2" style={{ alignItems: "start" }}>
      {card("it", "rp.itTitle", "rp.itLead")}
      {card("dev", "rp.devTitle", "rp.devLead")}
    </div>
    <section className="card card-pad stack" aria-labelledby="rp-when">
      <h2 id="rp-when" style={{ fontSize: 17 }}>{t("rp.schedule")}</h2>
      <div className="grid-3" style={{ alignItems: "end" }}>
        <div className="field"><label className="label" htmlFor="rp-day">{t("rp.weekday")}</label><select className="select" id="rp-day" value={s.weekday} onChange={e => setS({ ...s, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="rp-hour">{t("rp.hour")}</label><select className="select mono" id="rp-hour" value={s.hour} onChange={e => setS({ ...s, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div>
        <div><button type="button" className="btn btn-primary" disabled={busy} onClick={() => call("save", "/api/admin/reports", "PUT", s, t("rp.saved"))}>{t("rp.save")}</button></div>
      </div>
      <p className="hint">{t("rp.scheduleHint")}</p>
      <Msg area="save" />
    </section>
  </div>;
}
