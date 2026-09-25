"use client";
import { useT } from "./I18n";
import { Clock,Cross,IconBag,SkipMark,Tick } from "./Icons";
import { fmtDateTime as fmt } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";

export type LineStep={approver_name:string;approver_role:"manager"|"ceo";status:"waiting"|"approved"|"rejected"|"skipped";decided_at:string|null;skipped_by_name?:string|null;skip_reason?:string|null};
export type LineInput={approvalRequired:boolean;status:string;finished:boolean;steps:LineStep[];requesterName:string;createdAt:string;approvedAt?:string|null};
type State="approved"|"current"|"waiting"|"rejected"|"skipped";

// The single source of truth for what each node shows. Requester is the origin, never an approver;
// fulfilment is the last node but never an approval.
export function lineStates(l:LineInput){
  const rejected=l.steps.some(s=>s.status==="rejected");
  let currentFound=false;
  const steps=l.steps.map(s=>{let st:State=s.status==="approved"?"approved":s.status==="rejected"?"rejected":s.status==="skipped"?"skipped":"waiting";if(st==="waiting"&&!rejected&&!currentFound){st="current";currentFound=true;}return {...s,state:st};});
  const allApproved=l.steps.every(s=>s.status==="approved"||s.status==="skipped");
  const fulfil:State=l.finished&&!rejected?"approved":!rejected&&allApproved&&l.status!=="rejected"?"current":"waiting";
  return {steps,fulfil,rejected};
}

export function StatusPill({status,big}:{status:string;big?:boolean}){
  const t=useT();
  const tone=status==="rejected"||status==="cancelled"?"bad":status==="awaiting_approval"||status==="waiting"||status==="pending_manager"||status==="pending_finance"?"gold":["resolved","closed","confirmed","provisioned","whatsapp_sent"].includes(status)?"good":status==="new"?"neutral":"info";
  return <span className={`pill ${tone}${big?" big":""}`}>{t(`status.${status}` as I18nKey)}</span>;
}

function Node({state}:{state:State}){
  return <span className={`al-node ${state}`}>{state==="approved"?<Tick/>:state==="rejected"?<Cross/>:state==="current"?<Clock/>:state==="skipped"?<SkipMark/>:null}</span>;
}

export function ApprovalDots({line}:{line:LineInput}){
  const t=useT();
  if(!line.approvalRequired)return <span className="soft" style={{fontSize:13}}>{t("line.direct")}</span>;
  const {steps,fulfil}=lineStates(line);
  const role=(r:string)=>t(r==="ceo"?"role.ceo":"role.manager");
  const phrase=(state:State,who:string)=>t(state==="approved"?"line.a11y.approved":state==="rejected"?"line.a11y.rejected":state==="current"?"line.a11y.current":state==="skipped"?"line.a11y.skipped":"line.a11y.waiting",{who});
  const label=[...steps.map(s=>phrase(s.state,role(s.approver_role))),t(fulfil==="approved"?"line.a11y.done":fulfil==="current"?"line.a11y.doing":"line.a11y.fulfilNot")].join(", ");
  const nodes:State[]=[...steps.map(s=>s.state),fulfil];
  return <div role="img" aria-label={label} className="al-dots">
    {nodes.map((s,i)=><span key={i} style={{display:"contents"}}>{i>0&&<span className={`al-link${nodes[i-1]==="approved"||nodes[i-1]==="skipped"?" done":""}`}/>}<Node state={s}/></span>)}
  </div>;
}

export function ApprovalStepper({line}:{line:LineInput}){
  const t=useT();
  const {steps,fulfil,rejected}=lineStates(line);
  const initials=line.requesterName.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
  const barAfter=(s:State)=>s==="approved"||s==="skipped"?" done":s==="rejected"?" bad":"";
  const lastDecided=[...steps].reverse().find(s=>s.decided_at)?.decided_at||line.createdAt;
  return <ol className="al-steps" aria-label={t("det.line")}>
    <li>
      <div className="head"><span className="al-node origin" aria-hidden="true">{initials}</span><span className={`bar${barAfter(steps[0]?.state==="rejected"?"rejected":"approved")}`}/></div>
      <div className="txt"><span className="al-kicker">{t("who.requester")}</span><span className="al-name">{line.requesterName}</span><span className="al-state soft">{t("det.submitted")}</span><bdi className="al-time">{fmt(line.createdAt)}</bdi></div>
    </li>
    {steps.map((s,i)=><li key={i}>
      <div className="head"><Node state={s.state}/><span className={`bar${barAfter(s.state)}`}/></div>
      <div className="txt"><span className="al-kicker">{t("who.step",{n:i+1,role:t(s.approver_role==="ceo"?"role.ceo":"role.manager")})}</span><span className="al-name">{s.approver_name}</span>
        <span className={`al-state ${s.state==="approved"?"good":s.state==="rejected"?"bad":s.state==="current"?"gold":"soft"}`}>{s.state==="skipped"?t("det.skippedBy",{who:s.skipped_by_name||""}):t(s.state==="approved"?"det.approved":s.state==="rejected"?"det.rejected":s.state==="current"?"det.withNow":"det.notReached")}</span>
        {s.state==="skipped"&&s.skip_reason&&<span className="hint">{s.skip_reason}</span>}
        {s.decided_at?<bdi className="al-time">{fmt(s.decided_at)}</bdi>:s.state==="current"?<bdi className="al-time">{t("det.since",{t:fmt(i===0?line.createdAt:steps[i-1].decided_at||line.createdAt)})}</bdi>:null}
      </div>
    </li>)}
    <li>
      <div className="head"><span className={`al-node square ${fulfil}`}>{fulfil==="approved"?<Tick/>:fulfil==="current"?<Clock/>:<IconBag size={18}/>}</span></div>
      <div className="txt"><span className="al-kicker">{t("det.fulfil")}</span><span className="al-name">{t("det.fulfilWho")}</span>
        <span className={`al-state ${fulfil==="approved"?"good":fulfil==="current"?"gold":"soft"}`}>{t(fulfil==="approved"?"det.fulfilDone":fulfil==="current"?"det.fulfilDoing":"det.notReached")}</span>
        {fulfil==="current"?<bdi className="al-time">{t("det.since",{t:fmt(lastDecided)})}</bdi>:fulfil==="waiting"&&!rejected?<span className="hint">{t("det.fulfilWait")}</span>:null}
      </div>
    </li>
  </ol>;
}
