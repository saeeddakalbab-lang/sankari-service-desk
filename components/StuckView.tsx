"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { useT } from "./I18n";
import { IconInfo,IconWarn } from "./Icons";
import { refFor } from "@/lib/format";
import type { StuckRow } from "@/lib/oversight";

type Data={rows:StuckRow[];counts:{open:number;approval:number;fulfilment:number;overdue:number};generatedAt:string};
type Filter="all"|"approval"|"fulfilment"|"overdue";
const span=(ms:number)=>{const h=Math.max(0,Math.floor(ms/3600000));return `${Math.floor(h/24)}d ${String(h%24).padStart(2,"0")}h`;};
const short=(ms:number)=>{const h=Math.floor(Math.abs(ms)/3600000);return h>=48?`${Math.floor(h/24)}d`:`${h}h`;};

export function StuckView({initial,viewerId,readOnly,canSkip,skipAfterHours}:{initial:Data;viewerId:string;readOnly:boolean;canSkip:boolean;skipAfterHours:number}){
  const [skipping,setSkipping]=useState<string|null>(null),[reason,setReason]=useState(""),[skipErr,setSkipErr]=useState(""),[skipDone,setSkipDone]=useState("");
  const refresh=async()=>{const r=await fetch("/api/oversight/stuck",{cache:"no-store"});if(r.ok)setData(await r.json());};
  async function skip(id:string){setSkipErr("");if(!reason.trim()){setSkipErr(t("skip.reasonReq"));return;}const r=await fetch(`/api/requests/${id}/skip`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})}),d=await r.json();if(!r.ok){setSkipErr(d.error);return;}setSkipping(null);setReason("");setSkipDone(t("skip.done"));await refresh();}
  const skippable=(r:StuckRow)=>canSkip&&r.stage==="approval"&&r.holder_id!==viewerId&&r.requester_user_id!==viewerId&&now-new Date(r.since).getTime()>=skipAfterHours*3600000;
  const t=useT(),[data,setData]=useState(initial),[filter,setFilter]=useState<Filter>("all"),[now,setNow]=useState(()=>new Date(initial.generatedAt).getTime()),[stale,setStale]=useState(false);
  useEffect(()=>{const poll=setInterval(async()=>{try{const r=await fetch("/api/oversight/stuck",{cache:"no-store"});if(!r.ok)throw 0;setData(await r.json());setStale(false);}catch{setStale(true);}},15000),tick=setInterval(()=>setNow(Date.now()),1000);setNow(Date.now());return()=>{clearInterval(poll);clearInterval(tick);};},[]);
  const rows=data.rows.filter(r=>filter==="all"||(filter==="overdue"?new Date(r.sla_due_at).getTime()<now:r.stage===filter));
  const shown=rows.slice(0,50);
  return <>
    <header className="page-head">
      <div className="stack-s"><h1>{t("st.title")}</h1><p className="lead soft">{t("st.lead")}</p></div>
      <div className="row soft" style={{fontSize:13}} aria-live="polite"><span className="dot live" aria-hidden="true"/>{t("st.live",{t:`${Math.round((now-new Date(data.generatedAt).getTime())/1000)}s`})}</div>
    </header>
    {stale&&<div className="notice" role="status">{t("kpi.error")}</div>}
    {skipDone&&<div className="success" role="status">{skipDone}</div>}
    <section aria-label={t("dash.summary")} className="grid-3">
      <div className="tile"><div className="row" style={{justifyContent:"space-between"}}><span className="tile-label">{t("st.approver")}</span><span className="tile-num" style={{fontSize:32}}>{data.counts.approval}</span></div></div>
      <div className="tile"><div className="row" style={{justifyContent:"space-between"}}><span className="tile-label">{t("st.it")}</span><span className="tile-num" style={{fontSize:32}}>{data.counts.fulfilment}</span></div></div>
      <div className={`tile${data.counts.overdue?" alert":""}`}><div className="row" style={{justifyContent:"space-between"}}><span className="tile-label">{data.counts.overdue?<IconWarn size={16}/>:null}{t("st.past")}</span><span className="tile-num" style={{fontSize:32}}>{data.counts.overdue}</span></div></div>
    </section>
    <section className="card" aria-labelledby="st-h">
      <div className="card-head">
        <div className="row" style={{alignItems:"baseline",gap:12}}><h2 id="st-h">{t("st.open")}</h2><span className="soft" style={{fontSize:13}}>{t("st.showing",{n:shown.length,total:data.counts.open})}</span></div>
        <div role="group" aria-label={t("list.filter")} className="chips">
          {([["all","list.all",data.counts.open],["approval","st.inApproval",data.counts.approval],["fulfilment","st.withIt",data.counts.fulfilment],["overdue","st.past",data.counts.overdue]] as const).map(([f,k,n])=><button key={f} type="button" className="chip" aria-pressed={filter===f} onClick={()=>setFilter(f)}>{t(k)}<span className="mono">{n}</span></button>)}
        </div>
      </div>
      {shown.length?<div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("col.request")}</th><th scope="col">{t("col.stopped")}</th><th scope="col">{t("col.held")}</th><th scope="col" style={{textAlign:"end"}}>{t("col.waiting")}</th><th scope="col">{t("col.sla")}</th></tr></thead>
        <tbody>{shown.map(r=>{const due=new Date(r.sla_due_at).getTime()-now;return <tr key={r.id}>
          <td><div className="stack-s" style={{gap:2}}><Link href={`/requests/${r.id}`} className="ref" dir="ltr">{refFor(r.type,r.id,r.created_at)}</Link><span style={{fontWeight:500}}>{r.subject}</span></div></td>
          <td>{r.stage==="approval"?t("who.step",{n:r.step_no??1,role:t(r.approver_role==="ceo"?"role.ceo":"role.manager")}):t("st.fulfil")}</td>
          <td style={r.holder_id===viewerId?{fontWeight:600}:undefined}>{r.holder_id===viewerId?t("st.you"):r.holder_name||<span className="soft">{t("det.unassigned")}</span>}
            {skippable(r)&&(skipping===r.id?<div className="stack-s" style={{marginTop:8,maxWidth:320}}>
              <label className="label" htmlFor={`skip-${r.id}`} style={{fontSize:13}}>{t("skip.reason")}</label>
              <textarea className="textarea" id={`skip-${r.id}`} rows={2} maxLength={4000} value={reason} onChange={e=>setReason(e.target.value)} aria-invalid={!!skipErr} aria-describedby={skipErr?`skip-err-${r.id}`:undefined}/>
              {skipErr&&<div id={`skip-err-${r.id}`} className="notice" role="alert">{skipErr}</div>}
              <div className="row"><button type="button" className="btn btn-primary btn-small" onClick={()=>skip(r.id)}>{t("skip.confirm")}</button><button type="button" className="btn btn-small" onClick={()=>{setSkipping(null);setSkipErr("");}}>{t("skip.cancel")}</button></div>
            </div>:<div style={{marginTop:6}}><button type="button" className="btn btn-outline btn-small" onClick={()=>{setSkipping(r.id);setReason("");setSkipErr("");setSkipDone("");}}>{t("skip.button")}</button> <span className="hint">{t("skip.overdue",{h:span(now-new Date(r.since).getTime())})}</span></div>)}
          </td>
          <td className="num"><bdi>{span(now-new Date(r.since).getTime())}</bdi></td>
          <td>{due<0?<span className="pill bad"><IconWarn size={12}/>{t("st.overdue",{t:short(due)})}</span>:due<24*3600000?<span className="pill gold">{t("st.dueIn",{t:short(due)})}</span>:<span className="pill good">{t("st.onTime")}</span>}</td>
        </tr>;})}</tbody>
      </table></div>:<p className="card-pad soft">{t("list.empty")}</p>}
    </section>
    <p className="row soft" style={{fontSize:13}}><IconInfo size={16}/>{t("st.readonly")}</p>
  </>;
}
