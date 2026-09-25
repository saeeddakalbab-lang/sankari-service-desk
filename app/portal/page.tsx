import { ProtectedPage } from "@/components/ProtectedPage";
import { RequestList } from "@/components/RequestList";
import { StartCards } from "@/components/StartCards";
import { getRules } from "@/lib/rules";
import { listRequests } from "@/lib/requests";
import { toRows } from "@/lib/rows";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
const DAY=86400000;

export default async function Dashboard(){
  const {user,t,locale}=await getViewer();
  const rows=user?await toRows(await listRequests(user)):[];
  const recent=(r:(typeof rows)[number])=>Date.now()-new Date(r.created_at).getTime()<30*DAY;
  const open=rows.filter(r=>!r.line.finished&&r.status!=="rejected").length,inApproval=rows.filter(r=>r.status==="awaiting_approval").length;
  const done=rows.filter(r=>r.line.finished&&r.status!=="rejected"&&recent(r)).length,rejected=rows.filter(r=>r.status==="rejected"&&recent(r)).length;
  const hour=Number(new Intl.DateTimeFormat("en-GB",{hour:"numeric",hour12:false,timeZone:"Asia/Dubai"}).format(new Date()));
  const first=(user?.name||"").split(" ")[0];
  const today=new Intl.DateTimeFormat(locale==="ar"?"ar":"en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"Asia/Dubai"}).format(new Date());
  return <ProtectedPage>
    <header className="page-head"><div className="stack-s"><div className="eyebrow">{today}</div><h1>{t(hour<12?"dash.greeting":hour<18?"dash.greetingDay":"dash.greetingEve",{name:first})}</h1></div></header>
    <section aria-label={t("dash.summary")} className="grid-3">
      <div className="tile"><div className="tile-label">{t("dash.open")}</div><div className="tile-num">{open}</div><div className="tile-sub">{t("dash.openSub")}</div></div>
      <div className="tile"><div className="tile-label"><span className="dot gold" aria-hidden="true"/>{t("dash.inApproval")}</div><div className="tile-num">{inApproval}</div><div className="tile-sub">{t("dash.inApprovalSub")}</div></div>
      <div className="tile"><div className="tile-label"><span className="dot good" aria-hidden="true"/>{t("dash.done")}</div><div className="tile-num">{done}</div><div className="tile-sub">{rejected?t("dash.doneSub",{n:rejected}):t("dash.doneSubNone")}</div></div>
    </section>
    <section aria-labelledby="start-h" className="stack">
      <div className="page-head"><h2 id="start-h">{t("dash.start")}</h2><span className="soft" style={{fontSize:13}}>{t("dash.startHint")}</span></div>
      <StartCards t={t} approvalTypes={(await getRules()).approvalTypes}/>
    </section>
    <RequestList rows={rows} title={t("list.title")}/>
  </ProtectedPage>;
}
