"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useT } from "./I18n";
import type { JiraPerson, JiraSpace } from "@/lib/jira";

type Overview = { configured: boolean; days: number; spaces: JiraSpace[]; team: JiraPerson[]; syncedAt: string | null };
type Issue = { issue_key: string; project_key: string; summary: string; status: string; status_category: string; assignee_name: string | null; priority: string | null; due_date: string | null; issue_url: string };
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const today = () => new Date().toISOString().slice(0, 10);

// Progress of every Jira space (project) as a chart and a table, who is assigned in each, a team
// ranking with the best person of the period, and the viewer's own tasks. Reloads every 5 minutes.
export function JiraDashboard() {
  const t = useT();
  const [tab, setTab] = useState<"overview" | "mine">("overview"), [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null), [mine, setMine] = useState<Issue[] | null>(null), [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(tab === "mine" ? "/api/jira?view=mine" : `/api/jira?view=overview&days=${days}`, { cache: "no-store" }), d = await r.json();
      if (!r.ok) throw new Error(d.error || "Jira unavailable");
      if (tab === "mine") setMine(d.issues); else setData(d);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [tab, days]);
  useEffect(() => { load(); const id = setInterval(load, 5 * 60 * 1000); return () => clearInterval(id); }, [load]);

  const spaces = data?.spaces ?? [], all = spaces.reduce((s, x) => ({ total: s.total + x.total, done: s.done + x.done, overdue: s.overdue + x.overdue }), { total: 0, done: 0, overdue: 0 });
  const best = data?.team.find(p => p.doneInPeriod > 0) ?? null;
  const period = t(days === 0 ? "jr.allTime" : "jr.lastDays", { d: days });
  const Bar = ({ s }: { s: { done: number; inProgress: number; todo: number; total: number } }) => <div className="jstack" aria-hidden="true">
    {s.total ? <><span className="d" style={{ width: `${s.done / s.total * 100}%` }} /><span className="p" style={{ width: `${s.inProgress / s.total * 100}%` }} /><span className="t" style={{ width: `${s.todo / s.total * 100}%` }} /></> : <span className="t" style={{ width: "100%" }} />}
  </div>;

  return <div className="stack">
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div role="tablist" aria-label="Jira" className="seg">
        <button type="button" role="tab" aria-selected={tab === "overview"} aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>{t("jr.overview")}</button>
        <button type="button" role="tab" aria-selected={tab === "mine"} aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>{t("jr.mine")}</button>
      </div>
      {data?.syncedAt && <span className="soft" style={{ fontSize: 13 }}>{t("jr.synced", { at: new Date(data.syncedAt).toLocaleString() })}</span>}
    </div>
    {error && <div className="notice" role="alert">{error}</div>}
    {data && !data.configured && <div className="notice">{t("jr.notConfigured")}</div>}

    {tab === "overview" && data && <>
      <section aria-label={t("jr.summary")} className="grid-4">
        <div className="tile"><div className="tile-label">{t("jr.spaces")}</div><div className="tile-num">{spaces.filter(s => s.total).length}</div><div className="tile-sub">{t("jr.spacesSub", { n: spaces.length })}</div></div>
        <div className="tile"><div className="tile-label">{t("jr.issues")}</div><div className="tile-num">{all.total.toLocaleString()}</div><div className="tile-sub">{t("jr.doneOf", { d: all.done.toLocaleString() })}</div></div>
        <div className="tile"><div className="tile-label">{t("jr.complete")}</div><div className="tile-num">{pct(all.done, all.total)}%</div><div className="tile-sub">{t("jr.completeSub")}</div></div>
        <div className={`tile${all.overdue ? " alert" : ""}`}><div className="tile-label">{t("jr.overdue")}</div><div className="tile-num">{all.overdue}</div><div className="tile-sub">{t("jr.overdueSub")}</div></div>
      </section>

      <section className="card card-pad stack" aria-labelledby="jr-chart-h">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><h2 id="jr-chart-h" style={{ fontSize: 20 }}>{t("jr.progress")}</h2>
          <div className="row jlegend" style={{ fontSize: 13 }}><span><i className="d" />{t("jr.done")}</span><span><i className="p" />{t("jr.inProgress")}</span><span><i className="t" />{t("jr.todo")}</span></div></div>
        <ul className="jchart" role="list">
          {spaces.map(s => <li key={s.key}>
            <span className="jname"><strong>{s.name}</strong> <span className="soft mono" style={{ fontSize: 12 }}>{s.key}</span></span>
            <Bar s={s} />
            <span className="mono jpct" aria-label={t("jr.pctOf", { name: s.name, p: pct(s.done, s.total), d: s.done, n: s.total })}>{s.total ? `${pct(s.done, s.total)}%` : "—"}</span>
          </li>)}
        </ul>
      </section>

      <section className="card" aria-labelledby="jr-spaces-h">
        <div className="card-head"><h2 id="jr-spaces-h">{t("jr.bySpace")}</h2></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">{t("jr.space")}</th><th scope="col" className="num">{t("jr.issues")}</th><th scope="col" className="num">{t("jr.done")}</th><th scope="col" className="num">{t("jr.inProgress")}</th><th scope="col" className="num">{t("jr.todo")}</th><th scope="col">{t("jr.complete")}</th><th scope="col" className="num">{t("jr.overdue")}</th><th scope="col">{t("jr.people")}</th></tr></thead>
          <tbody>{spaces.map(s => <Fragment key={s.key}>
            <tr>
              <th scope="row" style={{ fontWeight: 600 }}>{s.name}<br /><span className="soft mono" style={{ fontSize: 12, fontWeight: 400 }}>{s.key}</span></th>
              <td className="num">{s.total}</td><td className="num">{s.done}</td><td className="num">{s.inProgress}</td><td className="num">{s.todo}</td>
              <td style={{ minWidth: 140 }}><div className="row" style={{ gap: 8 }}><div style={{ flex: 1 }}><Bar s={s} /></div><span className="mono">{pct(s.done, s.total)}%</span></div></td>
              <td className="num" style={s.overdue ? { color: "var(--bad-ink)", fontWeight: 600 } : undefined}>{s.overdue}</td>
              <td>{s.assignees.length ? <button type="button" className="btn btn-small" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>{t("jr.peopleBtn", { n: s.people })}</button> : "—"}</td>
            </tr>
            {open === s.key && <tr><td colSpan={8} style={{ background: "var(--bg)" }}>
              <table className="table" aria-label={t("jr.peopleIn", { name: s.name })}>
                <thead><tr><th scope="col">{t("jr.person")}</th><th scope="col" className="num">{t("jr.assigned")}</th><th scope="col" className="num">{t("jr.done")}</th><th scope="col" className="num">{t("jr.inProgress")}</th><th scope="col" className="num">{t("jr.todo")}</th><th scope="col">{t("jr.complete")}</th><th scope="col" className="num">{t("jr.overdue")}</th></tr></thead>
                <tbody>{s.assignees.map(a => <tr key={a.id ?? "none"}>
                  <th scope="row" className={a.id ? "" : "soft"} style={{ fontWeight: 500 }}>{a.id ? a.name || a.id : t("jr.unassigned")}</th>
                  <td className="num">{a.total}</td><td className="num">{a.done}</td><td className="num">{a.inProgress}</td><td className="num">{a.todo}</td>
                  <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 8 }}><div style={{ flex: 1 }}><Bar s={a} /></div><span className="mono">{pct(a.done, a.total)}%</span></div></td>
                  <td className="num" style={a.overdue ? { color: "var(--bad-ink)" } : undefined}>{a.overdue}</td>
                </tr>)}</tbody>
              </table></td></tr>}
          </Fragment>)}</tbody>
        </table></div>
      </section>

      <section className="card" aria-labelledby="jr-team-h">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="stack-s" style={{ gap: 2 }}><h2 id="jr-team-h">{t("jr.team")}</h2><span className="soft" style={{ fontSize: 13 }}>{t("jr.teamSub")}</span></div>
          <div role="group" aria-label={t("jr.period")} className="seg">{[30, 90, 0].map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d ? `${d}d` : t("jr.all")}</button>)}</div>
        </div>
        {best && <div className="card-pad jbest" role="status">
          <span className="pill good">★ {t("jr.best")}</span>
          <strong style={{ fontSize: 18 }}>{best.name || best.id}</strong>
          <span className="soft">{t("jr.bestWhy", { n: best.doneInPeriod, period, ot: best.withDue ? `${pct(best.onTime, best.withDue)}%` : "—" })}</span>
        </div>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col" className="num">#</th><th scope="col">{t("jr.person")}</th><th scope="col" className="num">{t("jr.doneIn", { period })}</th><th scope="col" className="num">{t("jr.assigned")}</th><th scope="col">{t("jr.complete")}</th><th scope="col" className="num">{t("jr.onTime")}</th><th scope="col" className="num">{t("jr.openNow")}</th><th scope="col" className="num">{t("jr.overdue")}</th><th scope="col">{t("jr.spaces")}</th></tr></thead>
          <tbody>{data.team.map((p, i) => <tr key={p.id}>
            <td className="num mono">{i + 1}</td>
            <th scope="row" style={{ fontWeight: 600 }}>{p.name || p.id}{p === best && <span className="pill good" style={{ marginInlineStart: 8 }}>★</span>}</th>
            <td className="num" style={{ fontWeight: 600 }}>{p.doneInPeriod}</td><td className="num">{p.assigned}</td>
            <td><span className="mono">{pct(p.done, p.assigned)}%</span></td>
            <td className="num mono">{p.withDue ? `${pct(p.onTime, p.withDue)}%` : "—"}</td>
            <td className="num">{p.open}</td>
            <td className="num" style={p.overdue ? { color: "var(--bad-ink)", fontWeight: 600 } : undefined}>{p.overdue}</td>
            <td className="soft mono" style={{ fontSize: 12 }}>{p.spaces.join(" · ")}</td>
          </tr>)}</tbody>
        </table></div>
        {!data.team.length && <p className="card-pad soft">{t("jr.noTeam")}</p>}
      </section>
    </>}

    {tab === "mine" && mine && <section className="card" aria-labelledby="jr-mine-h">
      <div className="card-head"><h2 id="jr-mine-h">{t("jr.mine")}</h2><span className="soft mono">{mine.length}</span></div>
      {mine.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("jr.key")}</th><th scope="col">{t("jr.summaryCol")}</th><th scope="col">{t("jr.space")}</th><th scope="col">{t("jr.status")}</th><th scope="col">{t("jr.due")}</th></tr></thead>
        <tbody>{mine.map(i => { const late = i.status_category !== "Done" && !!i.due_date && i.due_date < today(); return <tr key={i.issue_key}>
          <td><a className="ref" href={i.issue_url} target="_blank" rel="noreferrer" dir="ltr">{i.issue_key}</a></td><td>{i.summary}</td><td className="mono">{i.project_key}</td>
          <td><span className={`pill ${i.status_category === "Done" ? "good" : i.status_category === "In Progress" ? "gold" : "neutral"}`}>{i.status}</span></td>
          <td className="mono" dir="ltr" style={late ? { color: "var(--bad-ink)", fontWeight: 600 } : undefined}>{i.due_date || "—"}</td></tr>; })}</tbody>
      </table></div> : <p className="card-pad soft">{t("jr.noMine")}</p>}
    </section>}
  </div>;
}
