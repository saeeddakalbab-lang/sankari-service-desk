"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import { IconInfo,Tick } from "./Icons";
import { fmtDateTime } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export type PendingCard={id:string;ref:string;type:string;subject:string;description:string;requester_name:string;department:string;created_at:string;details:Record<string,string>;step_no:number;approver_role?:string;previous_approver_name:string|null;previous_comment:string|null;previous_decided_at:string|null;waitingFor:string};

// Approve / Reject post an intent; the server re-checks that this user holds the current step.
export function ApprovalsBoard({cards:initial}:{cards:PendingCard[]}){
  const t=useT(),router=useRouter();
  const [cards,setCards]=useState(initial),[errors,setErrors]=useState<Record<string,string>>({}),[done,setDone]=useState<{id:string;msg:string}|null>(null),[busy,setBusy]=useState<string|null>(null);
  async function act(card:PendingCard,decision:"approve"|"reject",form:HTMLFormElement){
    const comment=String(new FormData(form).get("comment")||"").trim();
    if(decision==="reject"&&!comment){setErrors({...errors,[card.id]:t("ap.commentReq")});(form.elements.namedItem("comment") as HTMLTextAreaElement)?.focus();return;}
    setBusy(card.id);setErrors({...errors,[card.id]:""});
    const r=await fetch(`/api/requests/${card.id}/approval`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,comment})}),d=await r.json();
    setBusy(null);
    if(!r.ok){setErrors({...errors,[card.id]:d.error});return;}
    setCards(cards.filter(c=>c.id!==card.id));setDone({id:card.id,msg:t(decision==="approve"?"ap.done.approved":"ap.done.rejected")});router.refresh();
  }
  return <>
    <header className="page-head">
      <div className="stack-s"><h1>{t("ap.title")}</h1><p className="lead soft">{cards.length===1?t("ap.countOne"):cards.length?t("ap.count",{n:cards.length}):t("ap.none")}</p></div>
      <p className="soft" style={{fontSize:13,maxWidth:360}}>{t("ap.rule")}</p>
    </header>
    {done&&<div className="success" role="status">{done.msg}</div>}
    {cards.map(c=>{const d=c.details;return <article key={c.id} className="card ap-card" aria-labelledby={`h-${c.id}`}>
      <div className="body">
        <div className="ap-meta"><span className="mono" dir="ltr" style={{color:"var(--ink)",fontWeight:500}}>{c.ref}</span><span aria-hidden="true">·</span><span>{t(`type.${c.type}` as I18nKey)}</span><span aria-hidden="true">·</span><span>{c.requester_name}, {c.department}</span><span aria-hidden="true">·</span><span>{t("ap.waiting",{t:c.waitingFor})}</span></div>
        <div className="row" style={{justifyContent:"space-between",alignItems:"baseline",gap:20}}>
          <h2 id={`h-${c.id}`} style={{fontFamily:"var(--f-body)",fontSize:20}}><Link href={`/requests/${c.id}`} style={{color:"var(--ink)"}}>{c.subject}</Link></h2>
          {d.amountCents&&<div className="amount" dir="ltr"><span className="big">{formatMoney(d.amountCents,d.currency||"USD")}</span>{d.amountAedCents&&d.currency!=="AED"&&<span className="small">{formatMoney(d.amountAedCents,"AED")} · {t(`cycle.${d.billingCycle||"annual"}` as I18nKey)}</span>}</div>}
        </div>
        <p style={{lineHeight:1.55,whiteSpace:"pre-wrap"}}>{c.description}</p>
        {c.previous_approver_name?<div className="prev">
          <span className="al-node approved" style={{width:22,height:22}}><Tick/></span>
          <div className="stack-s" style={{gap:4}}><div className="who-line">{t("ap.prevApproved",{who:c.previous_approver_name})} · <bdi className="mono">{fmtDateTime(c.previous_decided_at)}</bdi></div>{c.previous_comment&&<div style={{fontSize:14,lineHeight:1.5}}>“{c.previous_comment}”</div>}</div>
        </div>:<div className="note row" style={{alignItems:"flex-start"}}><IconInfo size={20}/><span>{c.approver_role==="manager"?t("ap.firstManager",{who:c.requester_name}):t("ap.straight")}</span></div>}
      </div>
      <form onSubmit={e=>e.preventDefault()}>
        <label className="label" htmlFor={`c-${c.id}`}>{t("ap.comment")} <span className="opt">· {t("ap.commentReq")}</span></label>
        <textarea className="textarea" id={`c-${c.id}`} name="comment" rows={4} maxLength={4000} style={{flexGrow:1}} aria-invalid={!!errors[c.id]} aria-describedby={errors[c.id]?`e-${c.id}`:undefined}/>
        {errors[c.id]&&<div id={`e-${c.id}`} className="notice" role="alert">{errors[c.id]}</div>}
        <div className="grid-2" style={{gap:10}}>
          <button type="button" className="btn btn-bad" disabled={busy===c.id} onClick={e=>act(c,"reject",e.currentTarget.form!)}>{t("ap.reject")}</button>
          <button type="button" className="btn btn-good" disabled={busy===c.id} onClick={e=>act(c,"approve",e.currentTarget.form!)}>{t("ap.approve")}</button>
        </div>
      </form>
    </article>;})}
  </>;
}
