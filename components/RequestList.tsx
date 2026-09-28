"use client";
import Link from "next/link";
import { useMemo,useState } from "react";
import { ApprovalDots,StatusPill,type LineInput } from "./ApprovalLine";
import { useT } from "./I18n";
import { fmtDate } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";

export type ListRow={id:string;ref:string;subject:string;type:string;created_at:string;status:string;line:LineInput;requester_name?:string;assignee_name?:string|null;overdue?:boolean};
type Filter="all"|"open"|"approval"|"done"|"rejected";
const bucket=(r:ListRow):Filter[]=>{const b:Filter[]=["all"];if(r.status==="rejected")b.push("rejected");else if(r.line.finished)b.push("done");else{b.push("open");if(r.status==="awaiting_approval")b.push("approval");}return b;};

export function RequestList({rows,title,team}:{rows:ListRow[];title:string;team?:boolean}){
  const t=useT(),[filter,setFilter]=useState<Filter>("all");
  const counts=useMemo(()=>{const c:Record<Filter,number>={all:0,open:0,approval:0,done:0,rejected:0};rows.forEach(r=>bucket(r).forEach(b=>c[b]++));return c;},[rows]);
  const visible=rows.filter(r=>bucket(r).includes(filter));
  const labels:Record<Filter,I18nKey>={all:"list.all",open:"dash.open",approval:"dash.inApproval",done:"list.done",rejected:"status.rejected"};
  return <section className="card" aria-labelledby="list-h">
    <div className="card-head">
      <h2 id="list-h">{title}</h2>
      <div role="group" aria-label={t("list.filter")} className="chips">
        {(Object.keys(labels) as Filter[]).map(f=><button key={f} type="button" className="chip" aria-pressed={filter===f} onClick={()=>setFilter(f)}>{t(labels[f])}<span className="mono">{counts[f]}</span></button>)}
      </div>
    </div>
    {visible.length?<div className="table-wrap"><table className="table">
      <thead><tr><th scope="col">{t("col.ref")}</th><th scope="col">{t("col.request")}</th><th scope="col">{t("col.type")}</th>{team&&<th scope="col">{t("col.requester")}</th>}<th scope="col">{t("col.submitted")}</th><th scope="col">{team?t("col.assignee"):t("col.approval")}</th><th scope="col">{t("col.status")}</th></tr></thead>
      <tbody>{visible.map(r=><tr key={r.id}>
        <td><Link className="ref" href={`/requests/${r.id}`} dir="ltr">{r.ref}</Link></td>
        <td style={{fontWeight:500}}>{r.subject}</td>
        <td className="soft">{t(`type.${r.type}` as I18nKey)}</td>
        {team&&<td>{r.requester_name}</td>}
        <td style={{whiteSpace:"nowrap"}}><bdi className="mono soft" style={{fontSize:13}}>{fmtDate(r.created_at)}</bdi></td>
        <td>{team?<span className={r.assignee_name?"":"soft"}>{r.assignee_name||t("det.unassigned")}</span>:<ApprovalDots line={r.line}/>}</td>
        <td><div className="row"><StatusPill status={r.status}/>{r.overdue&&<span className="pill bad">{t("q.overdue")}</span>}</div></td>
      </tr>)}</tbody>
    </table></div>:<p className="card-pad soft">{t("list.empty")}</p>}
  </section>;
}
