"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocale, useT } from "./I18n";
import { Logo } from "./Logo";
import { MAX_MONTHS, quote, withWorkPattern, type PricingConfig } from "@/lib/pricing";

const AR: Record<string, string> = { consultant: "مستشار", it_support: "أخصائي دعم تقني", devops: "DevOps", cybersecurity: "الأمن السيبراني" };
const usd = (c: bigint) => `USD ${(c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(c % 100n).toString().padStart(2, "0")}`;
const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`; };

// Public contract request. The live price uses the same function as the server; the server's figure wins.
export function ContractRequestForm({ pricing, minDate }: { pricing: PricingConfig; minDate: string }) {
  const t = useT(), locale = useLocale(), router = useRouter();
  const keys = Object.keys(pricing.services), label = (k: string) => locale === "ar" ? AR[k] ?? pricing.services[k].label : pricing.services[k].label;
  const full = withWorkPattern(pricing), range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const [lines, setLines] = useState([{ service: keys[0], weeks: String(full.weeksPerMonth), days: String(full.daysPerWeek) }]);
  const wire = () => lines.map(l => ({ service: l.service, weeksPerMonth: Number(l.weeks), daysPerWeek: Number(l.days) }));
  const [f, setF] = useState({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", requirements: "", supportType: "remote" as "remote" | "onsite", requestedStartDate: minDate, durationMonths: "6", website: "" });
  // What the contract document needs about the client (lib/contracts.ts clientDetailsSchema).
  const [det, setDet] = useState({ legalName: "", registry: "", taxNumber: "", title: "", address: "", city: "", sites: "", hoursFrom: "", hoursTo: "" });
  const dset = (k: keyof typeof det) => (e: React.ChangeEvent<HTMLInputElement>) => setDet({ ...det, [k]: e.target.value });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const q = useMemo(() => { try { return quote(pricing, { lines: wire(), durationMonths: Number(f.durationMonths), supportType: f.supportType }); } catch { return null; } }, [pricing, lines, f.durationMonths, f.supportType]);
  const unused = keys.filter(k => !lines.some(l => l.service === k));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, durationMonths: Number(f.durationMonths), lines: wire(), details: det }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); setDone(d.reference);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const lang = (l: "en" | "ar") => { setCookie("sk_locale", l); router.refresh(); };
  return <div className="public">
    <header className="public-head">
      <div className="brand"><Logo tone="white" width={84} /></div>
      <div className="row" role="group" aria-label="Language"><button type="button" className="btn btn-small" aria-pressed={locale === "en"} onClick={() => lang("en")} lang="en">English</button><button type="button" className="btn btn-small" aria-pressed={locale === "ar"} onClick={() => lang("ar")} lang="ar">العربية</button></div>
    </header>
    <main className="public-main">
      <div className="stack-s"><h1>{t("cr.title")}</h1><p className="soft">{t("cr.lead")}</p></div>
      {done ? <div className="card card-pad stack" role="status"><p className="success">{t("cr.sent", { ref: done })}</p><div><button type="button" className="btn" onClick={() => { setDone(null); setF({ ...f, requirements: "" }); }}>{t("cr.another")}</button></div></div> :
      <form className="public-grid" onSubmit={submit} noValidate={false}>
        <div className="stack">
          <section className="card card-pad stack" aria-labelledby="cr-who">
            <h2 id="cr-who" style={{ fontSize: 17 }}>{t("ct.client")}</h2>
            <div className="grid-2">
              <div className="field"><label className="label" htmlFor="cr-co">{t("cr.company")}</label><input className="input" id="cr-co" required minLength={2} maxLength={160} autoComplete="organization" value={f.companyName} onChange={set("companyName")} /></div>
              <div className="field"><label className="label" htmlFor="cr-name">{t("cr.contact")}</label><input className="input" id="cr-name" required minLength={2} maxLength={120} autoComplete="name" value={f.contactName} onChange={set("contactName")} /></div>
              <div className="field"><label className="label" htmlFor="cr-mail">{t("cr.email")}</label><input className="input mono" id="cr-mail" type="email" dir="ltr" required autoComplete="email" value={f.contactEmail} onChange={set("contactEmail")} /></div>
              <div className="field"><label className="label" htmlFor="cr-tel">{t("cr.phone")}</label><input className="input mono" id="cr-tel" type="tel" dir="ltr" required minLength={6} maxLength={40} autoComplete="tel" value={f.contactPhone} onChange={set("contactPhone")} /></div>
            </div>
            <h3 style={{ fontSize: 15, marginTop: 4 }}>{t("cr.forContract")}</h3>
            <p className="hint" style={{ marginTop: -6 }}>{t("cr.forContractHint")}</p>
            <div className="grid-2">
              <div className="field"><label className="label" htmlFor="cr-legal">{t("cr.legalName")} <span className="soft">{t("cr.optional")}</span></label><input className="input" id="cr-legal" maxLength={200} value={det.legalName} onChange={dset("legalName")} /></div>
              <div className="field"><label className="label" htmlFor="cr-title">{t("cr.signTitle")}</label><input className="input" id="cr-title" required minLength={2} maxLength={120} autoComplete="organization-title" value={det.title} onChange={dset("title")} /></div>
              <div className="field"><label className="label" htmlFor="cr-reg">{t("cr.registry")} <span className="soft">{t("cr.optional")}</span></label><input className="input mono" id="cr-reg" dir="ltr" maxLength={120} value={det.registry} onChange={dset("registry")} /></div>
              <div className="field"><label className="label" htmlFor="cr-tax">{t("cr.taxNumber")} <span className="soft">{t("cr.optional")}</span></label><input className="input mono" id="cr-tax" dir="ltr" maxLength={60} value={det.taxNumber} onChange={dset("taxNumber")} /></div>
              <div className="field"><label className="label" htmlFor="cr-addr">{t("cr.address")}</label><input className="input" id="cr-addr" required minLength={3} maxLength={300} autoComplete="street-address" value={det.address} onChange={dset("address")} /></div>
              <div className="field"><label className="label" htmlFor="cr-city">{t("cr.city")}</label><input className="input" id="cr-city" required minLength={2} maxLength={80} autoComplete="address-level2" value={det.city} onChange={dset("city")} /></div>
              <div className="field"><label className="label" htmlFor="cr-sites">{t("cr.sites")} <span className="soft">{t("cr.optional")}</span></label><input className="input" id="cr-sites" maxLength={300} value={det.sites} onChange={dset("sites")} aria-describedby="cr-sites-h" /><span id="cr-sites-h" className="hint">{t("cr.sitesHint")}</span></div>
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{t("cr.coverHours")} <span className="soft">{t("cr.optional")}</span></legend>
                <div className="row"><label className="sr-only" htmlFor="cr-hf">{t("cr.hoursFrom")}</label><input className="input mono" id="cr-hf" type="time" style={{ maxWidth: 140 }} value={det.hoursFrom} onChange={dset("hoursFrom")} /><span aria-hidden="true">–</span><label className="sr-only" htmlFor="cr-ht">{t("cr.hoursTo")}</label><input className="input mono" id="cr-ht" type="time" style={{ maxWidth: 140 }} value={det.hoursTo} onChange={dset("hoursTo")} /></div></fieldset>
            </div>
            {/* Bots fill every field; people never see this one. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}><label htmlFor="cr-web">Website</label><input id="cr-web" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></div>
          </section>
          <section className="card card-pad stack" aria-labelledby="cr-svc">
            <h2 id="cr-svc" style={{ fontSize: 17 }}>{t("cr.services")}</h2>
            {lines.map((l, i) => <div key={i} className="grid-3" style={{ alignItems: "end" }}>
              <div className="field"><label className="label" htmlFor={`cr-s${i}`}>{t("cr.service")}</label><select className="select" id={`cr-s${i}`} value={l.service} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, service: e.target.value } : x))}>{keys.filter(k => k === l.service || unused.includes(k)).map(k => <option key={k} value={k}>{label(k)}</option>)}</select></div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="field"><label className="label" htmlFor={`cr-w${i}`}>{t("cr.weeks")}</label><select className="select mono" id={`cr-w${i}`} value={l.weeks} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, weeks: e.target.value } : x))} aria-describedby="cr-hh">{range(full.weeksPerMonth).map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <div className="field"><label className="label" htmlFor={`cr-d${i}`}>{t("cr.days")}</label><select className="select mono" id={`cr-d${i}`} value={l.days} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, days: e.target.value } : x))} aria-describedby="cr-hh">{range(full.daysPerWeek).map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              </div>
              <div>{lines.length > 1 && <button type="button" className="btn btn-small" onClick={() => setLines(lines.filter((_, j) => j !== i))}>{t("cr.remove")}</button>}</div>
            </div>)}
            <span id="cr-hh" className="hint">{t("cr.fullMonth", { w: full.weeksPerMonth, d: full.daysPerWeek, h: full.hoursPerDay, t: full.standardHours })}</span>
            {unused.length > 0 && <div><button type="button" className="btn btn-outline btn-small" onClick={() => setLines([...lines, { service: unused[0], weeks: String(full.weeksPerMonth), days: String(full.daysPerWeek) }])}>{t("cr.addService")}</button></div>}
            <div className="field"><label className="label" htmlFor="cr-req">{t("cr.requirements")}</label><textarea className="textarea" id="cr-req" rows={5} required minLength={10} maxLength={4000} value={f.requirements} onChange={set("requirements")} /></div>
          </section>
          <section className="card card-pad" aria-labelledby="cr-terms">
            <h2 id="cr-terms" style={{ fontSize: 17, marginBottom: 12 }}>{t("ct.dates")}</h2>
            <div className="grid-3">
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{t("cr.support")}</legend>
                <div className="row">{(["remote", "onsite"] as const).map(v => <label key={v} className="choice compact"><input type="radio" name="support" value={v} checked={f.supportType === v} onChange={() => setF({ ...f, supportType: v })} />{t(v === "remote" ? "cr.remote" : "cr.onsite")}</label>)}</div></fieldset>
              <div className="field"><label className="label" htmlFor="cr-start">{t("cr.start")}</label><input className="input mono" id="cr-start" type="date" required min={minDate} value={f.requestedStartDate} onChange={set("requestedStartDate")} /></div>
              <div className="field"><label className="label" htmlFor="cr-dur">{t("cr.duration")}</label><input className="input mono" id="cr-dur" type="number" required min={1} max={MAX_MONTHS} step={1} value={f.durationMonths} onChange={set("durationMonths")} /></div>
            </div>
          </section>
        </div>
        <aside className="card card-pad stack public-price" aria-labelledby="cr-price" aria-live="polite">
          <h2 id="cr-price" style={{ fontSize: 17 }}>{t("cr.price")}</h2>
          {q ? <>
            <ul className="stack-s" style={{ listStyle: "none", margin: 0, padding: 0 }}>{q.lines.map(l => <li key={l.serviceKey} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <strong>{label(l.serviceKey)}</strong> <span className="soft">· {t("cr.lineLoad", { w: l.weeksPerMonth, d: l.daysPerWeek, h: l.hoursPerMonth })}</span><br />
              <span className="mono soft" dir="ltr" style={{ fontSize: 14 }}>{t("cr.perMonth", { amount: usd(l.monthlyPriceCents) })}</span><br />
              <span className="mono" dir="ltr" style={{ fontSize: 14 }}>{t("cr.lineTotal", { amount: usd(l.lineTotalCents), m: f.durationMonths })}</span></li>)}</ul>
            {q.onsitePremiumCents > 0n && <p className="soft">{t("cr.premium")}: <bdi className="mono" dir="ltr">{usd(q.onsitePremiumCents)}</bdi></p>}
            <div><span className="soft" style={{ fontSize: 13 }}>{t("cr.total")}</span><div className="mono" dir="ltr" style={{ fontSize: 26, fontWeight: 600 }}>{usd(q.totalCents)}</div></div>
            <p className="soft" style={{ fontSize: 13 }}>{t("cr.payments")}</p>
          </> : <p className="soft">—</p>}
          {error && <div className="notice" role="alert">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !q}>{t("cr.submit")}</button>
        </aside>
      </form>}
    </main>
  </div>;
}
