"use client";
import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { useT } from "./I18n";
import { IconWarn } from "./Icons";
import { refFor } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";

type Kpis={summary:{closed:number;sla_compliance:string|null;avg_resolution_hours:string|null;median_resolution_hours:string|null;open:number;in_approval:number;with_it:number;overdue:number};
  trend:{week:string;type:string;count:number}[];workload:{agent:string;open:number}[];overdue:{id:string;type:string;subject:string;sla_due_at:string;hours_overdue:number;holder_name:string|null;created_at?:string}[];generatedAt:string};

const weekStart=(d:Date)=>{const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-day);return x.toISOString().slice(0,10);};
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const label=(iso:string)=>`${iso.slice(8,10)} ${MONTHS[Number(iso.slice(5,7))-1]}`;
const hours=(h:number)=>h>=24?`${Math.floor(h/24)}d ${String(h%24).padStart(2,"0")}h`:`0d ${String(h).padStart(2,"0")}h`;

// Refreshes every 15 seconds without a page reload; keeps the last good numbers if a refresh fails.
export function KpiDashboard({initial}:{initial:Kpis}){
  const t=useT(),[days,setDays]=useState(30),[data,setData]=useState(initial),[now,setNow]=useState(()=>new Date(initial.generatedAt).getTime()),[stale,setStale]=useState(false);
  const load=useCallback(async(d:number)=>{try{const r=await fetch(`/api/kpis?days=${d}`,{cache:"no-store"});if(!r.ok)throw 0;setData(await r.json());setStale(false);}catch{setStale(true);}},[]);
  useEffect(()=>{load(days);const poll=setInterval(()=>load(days),15000);return()=>clearInterval(poll);},[days,load]);
  useEffect(()=>{setNow(Date.now());const tick=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(tick);},[]);
  const s=data.summary;
  // Eight most recent weeks, including an empty one when nothing came in.
  const weeks:string[]=[];const cur=new Date(weekStart(new Date()));for(let i=7;i>=0;i--){const w=new Date(cur);w.setUTCDate(w.getUTCDate()-7*i);weeks.push(w.toISOString().slice(0,10));}
  const byWeek=weeks.map(w=>{const items=data.trend.filter(x=>String(x.week).slice(0,10)===w);return {w,total:items.reduce((a,b)=>a+b.count,0),items};});
  const max=Math.max(1,...byWeek.map(b=>b.total)),peak=Math.max(...byWeek.map(b=>b.total));
  const agentMax=Math.max(1,...data.workload.map(w=>w.open));
  const fmtH=(v:string|null)=>v===null?"—":`${Number(v).toFixed(1)}h`;
  return <>
    <header className="page-head">
      <div className="stack-s"><h1>{t("kpi.title")}</h1><p className="lead soft">{t("kpi.lead")}</p></div>
      <div className="row" style={{gap:16}}>
        <div className="row soft" style={{fontSize:13}} aria-live="polite"><span className="dot live" aria-hidden="true"/>{t("st.live",{t:`${Math.max(0,Math.round((now-new Date(data.generatedAt).getTime())/1000))}s`})}</div>
        <div role="group" aria-label={t("kpi.range")} className="seg">{[30,90].map(d=><button key={d} type="button" aria-pressed={days===d} onClick={()=>setDays(d)} className="mono">{d}d</button>)}</div>
      </div>
    </header>
    {stale&&<div className="notice" role="status">{t("kpi.error")}</div>}
    <section aria-label={t("dash.summary")} className="grid-5">
      <div className="tile"><div className="tile-label">{t("kpi.openNow")}</div><div className="tile-num" style={{fontSize:36}}>{s.open}</div><div className="tile-sub">{t("kpi.openSub",{a:s.in_approval,b:s.with_it})}</div></div>
      <div className="tile"><div className="tile-label">{t("kpi.closed",{d:days})}</div><div className="tile-num" style={{fontSize:36}}>{s.closed}</div><div className="tile-sub">{t("kpi.closedSub")}</div></div>
      <div className="tile"><div className="tile-label">{t("kpi.sla")}</div><div className="tile-num" style={{fontSize:36}}>{s.sla_compliance===null?"—":`${s.sla_compliance}%`}</div><div className="tile-sub">{t("kpi.slaSub")}</div></div>
      <div className={`tile${s.overdue?" alert":""}`}><div className="tile-label">{s.overdue?<IconWarn size={14}/>:null}{t("kpi.overdue")}</div><div className="tile-num" style={{fontSize:36}}>{s.overdue}</div><div className="tile-sub">{t("kpi.overdueSub")}</div></div>
      <div className="tile"><div className="tile-label">{t("kpi.resolution")}</div><div className="row" style={{alignItems:"baseline"}}><span className="tile-num" style={{fontSize:36}}>{fmtH(s.median_resolution_hours)}</span><span className="soft" style={{fontSize:13}}>{t("kpi.median")}</span></div><div className="tile-sub">{t("kpi.avg",{h:fmtH(s.avg_resolution_hours)})}</div></div>
    </section>
    <div className="split" style={{gridTemplateColumns:"minmax(0,1fr) 420px"}}>
      <section className="card card-pad stack" aria-labelledby="vol-h">
        <div className="row" style={{justifyContent:"space-between",alignItems:"baseline"}}><h2 id="vol-h" style={{fontSize:20}}>{t("kpi.volume")}</h2><span className="soft" style={{fontSize:13}}>{t("kpi.volumeSub")}</span></div>
        <figure className="stack-s" style={{margin:0}} aria-label={byWeek.map(b=>`${label(b.w)}: ${b.total}`).join(", ")} role="img">
          <div className="bars" style={{"--n":8} as React.CSSProperties} dir="ltr">
            {byWeek.map((b,i)=>{const last=i===byWeek.length-1;return <div key={b.w} tabIndex={0} className={`bar${last?" partial":""}`} style={{height:`${Math.round(b.total/max*160)}px`}}>
              {(b.total===peak&&peak>0||last)&&<span className="val">{b.total}</span>}
              <span className="tip" role="tooltip"><strong>{label(b.w)}</strong><br/>{b.items.length?b.items.map(x=><span key={x.type}>{t(`type.${x.type}` as I18nKey)}: {x.count}<br/></span>):"0"}</span>
            </div>;})}
          </div>
          <div className="bar-labels" dir="ltr">{byWeek.map((b,i)=><span key={b.w}>{i===byWeek.length-1?t("kpi.thisWeek"):label(b.w)}</span>)}</div>
        </figure>
      </section>
      <section className="card card-pad stack" aria-labelledby="load-h">
        <div className="stack-s" style={{gap:2}}><h2 id="load-h" style={{fontSize:20}}>{t("kpi.workload")}</h2><span className="soft" style={{fontSize:13}}>{t("kpi.workloadSub")}</span></div>
        <dl className="hbars">{data.workload.map(w=><div key={w.agent}><dt className={w.agent==="Unassigned"?"soft":""}>{w.agent==="Unassigned"?t("det.unassigned"):w.agent}</dt><dd><div className={`hbar${w.agent==="Unassigned"?" warn":""}`} style={{width:`${Math.max(4,w.open/agentMax*100)}%`}}/></dd><dd className="mono" style={{textAlign:"end"}}>{w.open}</dd></div>)}</dl>
      </section>
    </div>
    <section className="card" aria-labelledby="od-h">
      <div className="card-head"><h2 id="od-h" style={{fontSize:20}}>{t("kpi.odQueue")}</h2><Link href="/oversight" className="btn btn-small">{t("kpi.seeStuck")}</Link></div>
      {data.overdue.length?<div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("col.ref")}</th><th scope="col">{t("col.request")}</th><th scope="col">{t("col.held")}</th><th scope="col" style={{textAlign:"end"}}>{t("kpi.odBy")}</th></tr></thead>
        <tbody>{data.overdue.map(o=><tr key={o.id}><td><Link className="ref" href={`/requests/${o.id}`} dir="ltr">{refFor(o.type,o.id,o.created_at||o.sla_due_at)}</Link></td><td>{o.subject}</td><td className={o.holder_name?"":"soft"}>{o.holder_name||t("det.unassigned")}</td><td className="num" style={{color:"var(--bad-ink)"}}><bdi>{hours(o.hours_overdue)}</bdi></td></tr>)}</tbody>
      </table></div>:<p className="card-pad soft">{t("kpi.none")}</p>}
    </section>
  </>;
}
