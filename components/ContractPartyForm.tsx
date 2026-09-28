"use client";
import { useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";
import type { ContractParty } from "@/lib/contract-template";

// Sankari's details as the first party on every contract and the issuer on every invoice.
// Written in Arabic, as they appear on the documents; a blank field prints as [●].
const FIELDS: { k: keyof ContractParty; label: I18nKey; wide?: boolean; ltr?: boolean; area?: boolean }[] = [
  { k: "legalName", label: "cp.legalName" }, { k: "registry", label: "cp.registry" }, { k: "taxNumber", label: "cp.taxNumber", ltr: true },
  { k: "representative", label: "cp.representative" }, { k: "title", label: "cp.title" }, { k: "authority", label: "cp.authority" },
  { k: "address", label: "cp.address", wide: true }, { k: "phone", label: "cp.phone", ltr: true }, { k: "email", label: "cp.email", ltr: true },
  { k: "city", label: "cp.city" }, { k: "arbitrationCity", label: "cp.arbitration" }, { k: "bank", label: "cp.bank", wide: true, ltr: true, area: true },
];
export function ContractPartyForm({ party }: { party: ContractParty }) {
  const t = useT();
  const [f, setF] = useState(party), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { const r = await fetch("/api/admin/contract-party", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Save failed"); setF(d); setMsg({ ok: true, text: t("pl.saved") }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }); } finally { setBusy(false); }
  };
  return <section className="card" aria-labelledby="cp-h" id="contract-party">
    <div className="card-head"><div className="stack-s" style={{ gap: 2 }}><h2 id="cp-h">{t("cp.title_")}</h2><span className="soft" style={{ fontSize: 13 }}>{t("cp.lead")}</span></div></div>
    <form className="card-pad stack" onSubmit={save}>
      <div className="grid-3">{FIELDS.map(x => <div key={x.k} className="field" style={x.wide ? { gridColumn: "1 / -1" } : undefined}>
        <label className="label" htmlFor={`cp-${x.k}`}>{t(x.label)}</label>
        {x.area ? <textarea className="textarea mono" id={`cp-${x.k}`} rows={4} dir="ltr" maxLength={600} value={f[x.k]} onChange={e => setF({ ...f, [x.k]: e.target.value })} aria-describedby="cp-bank-h" />
          : <input className={`input${x.ltr ? " mono" : ""}`} id={`cp-${x.k}`} dir={x.ltr ? "ltr" : undefined} type={x.k === "email" ? "email" : "text"} required={x.k === "legalName"} value={f[x.k]} onChange={e => setF({ ...f, [x.k]: e.target.value })} />}
        {x.area && <span id="cp-bank-h" className="hint">{t("cp.bankHint")}</span>}
      </div>)}</div>
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{t("pl.save")}</button></div>
      {msg && <p className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </form>
  </section>;
}
