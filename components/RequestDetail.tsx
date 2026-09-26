"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApprovalStepper,StatusPill,type LineInput } from "./ApprovalLine";
import { useT } from "./I18n";
import { IconBack } from "./Icons";
import { fmtDateTime } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { APPROVAL_STATUSES,STATUS_BY_TYPE,type RequestRecord } from "@/lib/types";

type Comment={id:string;author_name:string;body:string;internal:boolean;created_at:string};
type Decision={approver_name:string;approver_role:string;status:string;decided_at:string|null;comment:string|null;skipped_by_name?:string|null;skip_reason?:string|null};
const initials=(n:string)=>n.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase();

type Change={at:string;who:string|null;action:string;status_before:string|null;status:string|null;assignee_before:string|null;assignee:string|null;assignee_name:string|null};

export function RequestDetail({request:initial,refCode,line,decisions,comments:initialComments,changes=[],canManage,agents,renderedAt}:{request:RequestRecord;refCode:string;line:LineInput;decisions:Decision[];comments:Comment[];changes?:Change[];canManage:boolean;agents:{id:string;name:string}[];renderedAt:number}){
  const t=useT(),router=useRouter();
  const [request,setRequest]=useState(initial),[comments,setComments]=useState(initialComments),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const d=request.details as Record<string,string>;
  const role=(r:string)=>t(r==="ceo"?"role.ceo":"role.manager");

  // The target was fixed when the request was submitted; later rule changes never move it.
  const total=Math.max(1,Math.round((new Date(request.sla_due_at).getTime()-new Date(request.created_at).getTime())/3600000)),end=request.resolved_at?new Date(request.resolved_at).getTime():renderedAt;
  const used=Math.max(0,Math.round((end-new Date(request.created_at).getTime())/3600000)),left=Math.round((new Date(request.sla_due_at).getTime()-end)/3600000);
  const slaTone=request.resolved_at?(left>=0?"ok":"bad"):left<0?"bad":left<=24?"":"ok";

  async function comment(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError("");const form=e.currentTarget,fd=new FormData(form);
    const r=await fetch(`/api/requests/${request.id}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:fd.get("body"),internal:fd.get("internal")==="on",version:request.version})}),res=await r.json();
    if(!r.ok)return setError(res.error);setComments([...comments,res]);setRequest(q=>({...q,version:q.version+1}));form.reset();}
  async function transition(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(saving)return;setError("");setSaving(true);const fd=new FormData(e.currentTarget);
    try{const r=await fetch(`/api/requests/${request.id}/transition`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:fd.get("status"),assigneeId:fd.get("assigneeId")||null,version:request.version})}),res=await r.json();
      if(!r.ok)return setError(res.error);setRequest(q=>({...q,...res,assignee_name:agents.find(a=>a.id===res.assignee_id)?.name??null}));router.refresh();}
    catch{setError(t("err.generic"));}finally{setSaving(false);}}

  const events=[
    {at:request.created_at,who:request.requester_name,text:t("det.submittedBy"),tone:"",body:null as string|null,internal:false},
    ...decisions.filter(x=>x.decided_at).map(x=>x.status==="skipped"?{at:x.decided_at!,who:x.skipped_by_name||"",text:t("det.skippedStep",{who:x.approver_name,role:role(x.approver_role)}),tone:"",body:x.skip_reason??null,internal:false}:{at:x.decided_at!,who:x.approver_name,text:t(x.status==="approved"?"det.approvedAs":"det.rejectedAs",{role:role(x.approver_role)}),tone:x.status==="approved"?"good":"bad",body:x.comment,internal:false}),
    ...comments.map(c=>({at:c.created_at,who:c.author_name,text:"",tone:"",body:c.body,internal:c.internal})),
    ...changes.flatMap(x=>{const who=x.who||"IT",out:{at:string;who:string;text:string;tone:string;body:string|null;internal:boolean}[]=[];
      if(x.action!=="request.transition")out.push({at:x.at,who,text:t(x.action==="ticket.email_start"?"det.startedFromEmail":"det.rejectedFromEmail"),tone:"",body:null,internal:false});
      else{if(x.status&&x.status!==x.status_before)out.push({at:x.at,who,text:t("det.changedStatus",{status:t(`status.${x.status}` as I18nKey)}),tone:"",body:null,internal:false});
        if(x.assignee!==x.assignee_before)out.push({at:x.at,who,text:x.assignee?t("det.assignedTo",{who:x.assignee_name||""}):t("det.removedAssignee"),tone:"",body:null,internal:false});}
      return out;}),
  ].sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());

  const lockedForApproval=request.approval_required&&(request.status==="awaiting_approval"||request.status==="rejected");
  const statusOptions=STATUS_BY_TYPE[request.type].filter(s=>s===request.status||!(APPROVAL_STATUSES as readonly string[]).includes(s));

  return <>
    <header className="page-head">
      <div className="stack-s">
        <Link href="/requests" className="back"><span className="flip-rtl" style={{display:"inline-flex"}}><IconBack size={16}/></span>{t("det.mine")}</Link>
        <div className="row soft" style={{fontSize:14}}><span className="mono" dir="ltr" style={{color:"var(--ink)",fontWeight:500}}>{refCode}</span><span aria-hidden="true">·</span><span>{t(`type.${request.type}` as I18nKey)}</span></div>
        <h1>{request.subject}</h1>
      </div>
      <StatusPill status={request.status} big/>
    </header>
    {error&&<div className="notice" role="alert">{error}</div>}
    {request.approval_required&&<section className="card card-pad" aria-label={t("det.line")}><ApprovalStepper line={line}/></section>}

    <div className="split-340">
      <div className="stack" style={{gap:24}}>
        <section className="card card-pad stack" aria-labelledby="just-h">
          <h2 id="just-h">{request.type==="subscription_approval"?t("det.justification"):t("det.description")}</h2>
          <p style={{lineHeight:1.6,whiteSpace:"pre-wrap"}}>{request.description}</p>
          {request.type==="subscription_approval"&&<dl className="facts">
            <div><dt>{t("det.cost",{cycle:t(`cycle.${d.billingCycle||"annual"}` as I18nKey)})}</dt><dd dir="ltr">{d.amountCents?formatMoney(d.amountCents,d.currency||"USD"):"—"}</dd></div>
            <div><dt>{t("det.aed")}</dt><dd dir="ltr">{d.amountAedCents?formatMoney(d.amountAedCents,"AED"):"—"}</dd></div>
            <div><dt>{t("det.seats")}</dt><dd>{d.seats||"—"}</dd></div>
            <div><dt>{t("det.card")}</dt><dd dir="ltr">{d.cardLast4?`•••• ${d.cardLast4}`:"—"}</dd></div>
          </dl>}
          {request.type==="email_account_request"&&<dl className="facts">
            <div><dt>{t("em.fullName")}</dt><dd style={{fontFamily:"var(--f-body)"}}>{d.employeeName}</dd></div>
            <div style={{gridColumn:"span 2"}}><dt>{t("det.email")}</dt><dd dir="ltr">{d.emailLocal}@{d.domain}</dd></div>
            <div><dt>{t("em.start")}</dt><dd dir="ltr">{d.startDate||"—"}</dd></div>
            {d.groups&&<div style={{gridColumn:"1 / -1"}}><dt>{t("det.groups")}</dt><dd dir="ltr" style={{fontSize:14}}>{d.groups}</dd></div>}
          </dl>}
          {request.type==="helpdesk_ticket"&&<dl className="facts">
            <div><dt>{t("det.category")}</dt><dd style={{fontFamily:"var(--f-body)"}}>{d.category}</dd></div>
            <div><dt>{t("det.priority")}</dt><dd style={{fontFamily:"var(--f-body)"}}>{t(`prio.${request.priority}` as I18nKey)}</dd></div>
            {d.assetTag&&<div><dt>{t("det.asset")}</dt><dd dir="ltr">{d.assetTag}</dd></div>}
          </dl>}
        </section>

        <section className="card card-pad stack" aria-labelledby="act-h">
          <h2 id="act-h">{t("det.activity")}</h2>
          <ol className="activity">{events.map((ev,i)=><li key={i}>
            <span className={`avatar ${ev.tone}`} aria-hidden="true">{initials(ev.who)}</span>
            <div style={{flexGrow:1}}>
              <div className="meta"><div><strong style={{fontWeight:600}}>{ev.who}</strong> <span className="soft">{ev.text}</span>{ev.internal&&<> <span className="pill neutral">{t("det.internal")}</span></>}</div><bdi className="mono muted" style={{fontSize:13}}>{fmtDateTime(ev.at)}</bdi></div>
              {ev.body&&<div className="bubble">{ev.body}</div>}
            </div>
          </li>)}</ol>
          <form onSubmit={comment} className="stack-s" style={{paddingTop:18,borderTop:"1px solid var(--line)"}}>
            <label className="label" htmlFor="cmt">{t("det.comment")}</label>
            <textarea className="textarea" id="cmt" name="body" rows={3} required maxLength={8000} placeholder={t("det.commentPh")}/>
            <div className="row" style={{justifyContent:"space-between"}}>
              {canManage?<label className="row" style={{minHeight:44,fontSize:14}}><input type="checkbox" name="internal" style={{width:18,height:18,accentColor:"var(--accent)"}}/>{t("det.internalNote")}</label>:<span/>}
              <button className="btn btn-outline">{t("det.post")}</button>
            </div>
          </form>
        </section>
      </div>

      <div className="stack" style={{gap:24}}>
        <aside className="card card-pad stack" aria-labelledby="det-h">
          <h2 id="det-h">{t("det.details")}</h2>
          <div className={`sla ${slaTone}`}>
            <div className="row" style={{justifyContent:"space-between"}}><strong style={{fontSize:14}}>{t("det.sla",{h:total})}</strong><span className="mono" style={{fontSize:14}}>{left>=0?t("det.left",{h:left}):t("det.over",{h:-left})}</span></div>
            <div className="meter" role="meter" aria-label={t("det.sla",{h:total})} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(used,total)} aria-valuetext={t("det.slaUsed",{u:used,t:total})}><div style={{width:`${Math.min(100,Math.round(used/total*100))}%`}}/></div>
            <div style={{fontSize:13}}>{t("det.due")} <bdi className="mono">{fmtDateTime(request.sla_due_at)}</bdi></div>
          </div>
          <dl className="rail">
            <div><dt>{t("det.reference")}</dt><dd className="mono" dir="ltr">{refCode}</dd></div>
            <div><dt>{t("col.type")}</dt><dd>{t(`type.${request.type}` as I18nKey)}</dd></div>
            <div><dt>{t("det.priority")}</dt><dd>{t(`prio.${request.priority}` as I18nKey)}</dd></div>
            <div><dt>{t("form.department")}</dt><dd>{request.department}</dd></div>
            <div><dt>{t("form.company")}</dt><dd>{request.company}</dd></div>
            {request.type==="subscription_approval"&&<div><dt>{t("det.payment")}</dt><dd>{t(d.paymentMethod==="bank_transfer"?"pay.transfer":d.paymentMethod==="online_payment"?"pay.online":"pay.card")}{d.cardLast4&&<> <bdi className="mono">•••• {d.cardLast4}</bdi></>}</dd></div>}
            <div><dt>{t("det.assigned")}</dt><dd className={request.assignee_name?"":"soft"}>{request.assignee_name||(lockedForApproval?t("det.afterApproval"):t("det.unassigned"))}</dd></div>
          </dl>
        </aside>
        {canManage&&!lockedForApproval&&<form className="card card-pad stack" onSubmit={transition} aria-labelledby="man-h">
          <h2 id="man-h">{t("det.manage")}</h2>
          <div className="field"><label className="label" htmlFor="status">{t("col.status")}</label><select className="select" id="status" name="status" defaultValue={request.status}>{statusOptions.map(s=><option key={s} value={s}>{t(`status.${s}` as I18nKey)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="assigneeId">{t("col.assignee")}</label><select className="select" id="assigneeId" name="assigneeId" defaultValue={request.assignee_id||""}><option value="">{t("det.unassigned")}</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <button className="btn btn-primary" disabled={saving}>{t("det.save")}</button>
        </form>}
      </div>
    </div>
  </>;
}
