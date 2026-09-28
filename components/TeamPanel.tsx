"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import type { TeamState } from "@/lib/team";

// "Who is your manager?" and "My team". Naming each other links an employee to a manager; the card
// says what is still missing. mode "prompt" is the dashboard card for someone without a manager;
// mode "settings" is both sections in Settings.
export function TeamPanel({ initial, mode }: { initial: TeamState; mode: "prompt" | "settings" }) {
  const t = useT(), router = useRouter();
  const [st, setSt] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ area: string; ok: boolean; text: string } | null>(null);
  const [mName, setMName] = useState(""), [mEmail, setMEmail] = useState(""), [addEmail, setAddEmail] = useState(""), [changing, setChanging] = useState(false);
  const act = async (area: string, body: object, ok: (matched: boolean) => string) => {
    setBusy(true); setMsg(null);
    try { const r = await fetch("/api/me/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); setSt(d.state); setMsg({ area, ok: true, text: ok(!!d.matched) }); setChanging(false); router.refresh(); return true; }
    catch (e) { setMsg({ area, ok: false, text: e instanceof Error ? e.message : String(e) }); return false; } finally { setBusy(false); }
  };
  const Msg = ({ area }: { area: string }) => msg?.area === area ? <p className={msg.ok ? "success" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null;

  const managerForm = <form className="stack-s" onSubmit={async e => { e.preventDefault(); if (await act("mgr", { action: "set_manager", name: mName, email: mEmail }, m => t(m ? "tm.matched" : "tm.named"))) { setMName(""); setMEmail(""); } }}>
    <div className="grid-2" style={{ alignItems: "end" }}>
      <div className="field"><label className="label" htmlFor={`tm-name-${mode}`}>{t("tm.managerName")}</label><input className="input" id={`tm-name-${mode}`} required minLength={2} maxLength={120} autoComplete="off" value={mName} onChange={e => setMName(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor={`tm-mail-${mode}`}>{t("tm.managerEmail")}</label><input className="input mono" id={`tm-mail-${mode}`} type="email" dir="ltr" required autoComplete="off" value={mEmail} onChange={e => setMEmail(e.target.value.trim().toLowerCase())} /></div>
    </div>
    <div><button type="submit" className="btn btn-primary" disabled={busy || !mEmail.includes("@") || mName.trim().length < 2}>{t("tm.saveManager")}</button></div>
  </form>;

  const offers = st.offers.length > 0 && !st.manager && <div className="stack-s">
    {st.offers.map(o => <div key={o.managerUserId} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10 }}>
      <span>{t("tm.offer", { name: o.name })} <bdi className="mono soft" style={{ fontSize: 13 }}>{o.email}</bdi></span>
      <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => act("mgr", { action: "accept", managerUserId: o.managerUserId }, () => t("tm.matched"))}>{t("tm.confirm", { name: o.name.split(" ")[0] })}</button>
    </div>)}</div>;

  const myManager = <section className="card card-pad stack" aria-labelledby={`tm-h-${mode}`} id="manager">
    <div className="stack-s"><h2 id={`tm-h-${mode}`} style={{ fontSize: 18 }}>{t(mode === "prompt" ? "tm.promptTitle" : "tm.myManager")}</h2>
      {!st.manager && <p className="soft" style={{ fontSize: 14 }}>{t("tm.lead")}</p>}</div>
    {st.manager ? <p>{t("tm.current", { name: st.manager.name })} <bdi className="mono soft" style={{ fontSize: 13 }}>{st.manager.email}</bdi><br /><span className="hint">{t("tm.changeByAdmin")}</span></p>
      : <>
        {offers}
        {st.claim && !changing ? <div className="stack-s"><p className="notice" style={{ margin: 0 }}>{t("tm.waiting", { name: st.claim.knownName || st.claim.name || st.claim.email, email: st.claim.email })}</p>
          <p className="hint">{t(st.claim.knownName ? "tm.waitingHint" : "tm.waitingNotJoined")}</p>
          <div><button type="button" className="btn btn-small" onClick={() => { setChanging(true); setMName(st.claim?.name ?? ""); setMEmail(st.claim?.email ?? ""); }}>{t("tm.change")}</button></div></div>
          : managerForm}
      </>}
    <Msg area="mgr" />
  </section>;

  if (mode === "prompt") return myManager;

  const myTeam = <section className="card card-pad stack" aria-labelledby="tm-team-h" id="team">
    <div className="stack-s"><h2 id="tm-team-h" style={{ fontSize: 18 }}>{t("tm.myTeam")}</h2><p className="soft" style={{ fontSize: 14 }}>{t("tm.teamLead")}</p></div>
    {st.team.length > 0 && <ul className="stack-s" style={{ listStyle: "none", margin: 0, padding: 0 }}>{st.team.map(m => <li key={m.id} className="row" style={{ gap: 8 }}><span className="pill good">{t("tm.inTeam")}</span><strong style={{ fontWeight: 600 }}>{m.name}</strong> <bdi className="mono soft" style={{ fontSize: 13 }}>{m.email}</bdi></li>)}</ul>}
    {st.pending.length > 0 && <ul className="stack-s" style={{ listStyle: "none", margin: 0, padding: 0 }}>{st.pending.map(p => <li key={p.email} className="row" style={{ gap: 8, alignItems: "center" }}>
      <span className="pill gold">{t(p.placed ? "tm.hasOther" : p.joined ? "tm.waitingThem" : "tm.notJoined")}</span>
      {p.name && <strong style={{ fontWeight: 600 }}>{p.name}</strong>} <bdi className="mono soft" style={{ fontSize: 13 }}>{p.email}</bdi>
      <button type="button" className="btn btn-small" disabled={busy} aria-label={`${t("rp.remove")} ${p.email}`} onClick={() => act("team", { action: "remove", email: p.email }, () => t("tm.removed"))}>{t("rp.remove")}</button></li>)}</ul>}
    {!st.team.length && !st.pending.length && <p className="soft" style={{ fontSize: 14 }}>{t("tm.noTeam")}</p>}
    <form className="row" style={{ alignItems: "end" }} onSubmit={async e => { e.preventDefault(); if (await act("team", { action: "add", email: addEmail }, m => t(m ? "tm.addedMatched" : "tm.added"))) setAddEmail(""); }}>
      <div className="field" style={{ flex: 1, minWidth: 240 }}><label className="label" htmlFor="tm-add">{t("tm.addLabel")}</label><input className="input mono" id="tm-add" type="email" dir="ltr" required autoComplete="off" value={addEmail} onChange={e => setAddEmail(e.target.value.trim().toLowerCase())} /></div>
      <button type="submit" className="btn btn-outline" disabled={busy || !addEmail.includes("@")}>{t("tm.add")}</button>
    </form>
    <Msg area="team" />
  </section>;
  return <div className="grid-2" style={{ alignItems: "start", gap: 24 }}>{myManager}{myTeam}</div>;
}
