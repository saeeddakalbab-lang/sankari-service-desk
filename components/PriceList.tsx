"use client";
import { useState } from "react";
import { useLocale, useT } from "./I18n";
import { withWorkPattern, type PricingConfig } from "@/lib/pricing";

const AR: Record<string, string> = { consultant: "مستشار", it_support: "أخصائي دعم تقني", devops: "DevOps", cybersecurity: "الأمن السيبراني" };
const usd = (c: bigint) => `USD ${(c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(c % 100n).toString().padStart(2, "0")}`;
const toCents = (s: string) => { const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s.trim()); return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0")) : null; };
const toText = (c: number) => (c / 100).toFixed(2);
const half = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);

// The contract price list: base salary per service, and what a full month, two weeks and one week
// cost with (base salary + flat cost) x multiplier. Admins edit it; the accountant reads it.
export function PriceList({ pricing, canEdit }: { pricing: PricingConfig; canEdit: boolean }) {
  const t = useT(), locale = useLocale();
  const [cfg, setCfg] = useState(withWorkPattern(pricing));
  const [base, setBase] = useState(() => Object.fromEntries(Object.entries(pricing.services).map(([k, s]) => [k, toText(s.baseSalaryCents)])));
  const [flat, setFlat] = useState(toText(pricing.flatCostCents)), [mult, setMult] = useState(String(pricing.multiplier));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flatC = toCents(flat), multN = /^\d{1,2}$/.test(mult) && Number(mult) >= 1 ? BigInt(mult) : null;
  const weeks = BigInt(cfg.weeksPerMonth);
  const rows = Object.entries(cfg.services).map(([k, s]) => {
    const b = toCents(base[k] ?? ""), full = b !== null && flatC !== null && multN !== null ? (b + flatC) * multN : null;
    return { k, label: locale === "ar" ? AR[k] ?? s.label : s.label, b, full, two: full === null ? null : half(full * 2n, weeks), one: full === null ? null : half(full, weeks) };
  });
  const valid = flatC !== null && multN !== null && rows.every(r => r.b !== null);
  const save = async () => {
    if (!valid) { setMsg({ ok: false, text: t("pl.invalid") }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flatCostCents: Number(flatC), multiplier: Number(multN), baseSalaries: Object.fromEntries(rows.map(x => [x.k, Number(x.b)])) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Save failed");
      setCfg(withWorkPattern(d)); setMsg({ ok: true, text: t("pl.saved") });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return <section className="card" aria-labelledby="pl-h">
    <div className="card-head"><div className="stack-s" style={{ gap: 2 }}><h2 id="pl-h">{t("pl.title")}</h2><span className="soft" style={{ fontSize: 13 }}>{t("pl.formula", { flat: usd(flatC ?? 0n), m: String(multN ?? "?") })}</span></div></div>
    <div className="table-wrap"><table className="table">
      <thead><tr><th scope="col">{t("cr.service")}</th><th scope="col">{t("pl.base")}</th><th scope="col" className="num">{t("pl.full", { w: cfg.weeksPerMonth })}</th><th scope="col" className="num">{t("pl.two")}</th><th scope="col" className="num">{t("pl.one")}</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.k}>
        <th scope="row" style={{ fontWeight: 600 }}>{r.label}</th>
        <td>{canEdit ? <input className="input mono" dir="ltr" inputMode="decimal" aria-label={`${t("pl.base")} · ${r.label}`} aria-invalid={r.b === null} style={{ maxWidth: 150 }} value={base[r.k]} onChange={e => setBase({ ...base, [r.k]: e.target.value })} /> : <span className="mono" dir="ltr">{r.b === null ? "—" : usd(r.b)}</span>}</td>
        <td className="num" dir="ltr" style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{r.full === null ? "—" : usd(r.full)}</td>
        <td className="num" dir="ltr" style={{ whiteSpace: "nowrap" }}>{r.two === null ? "—" : usd(r.two)}</td>
        <td className="num" dir="ltr" style={{ whiteSpace: "nowrap" }}>{r.one === null ? "—" : usd(r.one)}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="card-pad stack">
      {canEdit && <div className="grid-3" style={{ alignItems: "end" }}>
        <div className="field"><label className="label" htmlFor="pl-flat">{t("pl.flat")}</label><input className="input mono" id="pl-flat" dir="ltr" inputMode="decimal" aria-invalid={flatC === null} value={flat} onChange={e => setFlat(e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="pl-mult">{t("pl.mult")}</label><input className="input mono" id="pl-mult" dir="ltr" inputMode="numeric" aria-invalid={multN === null} value={mult} onChange={e => setMult(e.target.value)} /></div>
        <div><button type="button" className="btn btn-primary" disabled={busy || !valid} onClick={save}>{t("pl.save")}</button></div>
      </div>}
      <p className="hint">{t("pl.note", { w: cfg.weeksPerMonth, d: cfg.daysPerWeek, h: cfg.hoursPerDay, t: cfg.standardHours })}</p>
      {msg && <p className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  </section>;
}
