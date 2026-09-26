import { ProtectedPage } from "@/components/ProtectedPage";
import { RequestList } from "@/components/RequestList";
import { listRequests } from "@/lib/requests";
import { toRows } from "@/lib/rows";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function TeamQueue(){
  const {user,t}=await getViewer();
  const isTeam=!!user&&(user.roles.includes("agent")||user.roles.includes("admin"));
  const rows=isTeam?await toRows(await listRequests(user!,true)):[];
  const open=rows.filter(r=>!r.line.finished&&r.status!=="rejected");
  return <ProtectedPage roles={["agent","admin"]}>
    <header className="stack-s"><h1>{t("q.title")}</h1><p className="lead soft">{t("q.lead")}</p></header>
    <section aria-label={t("dash.summary")} className="grid-4">
      <div className="tile"><div className="tile-label">{t("q.total")}</div><div className="tile-num">{rows.length}</div></div>
      <div className="tile"><div className="tile-label">{t("q.open")}</div><div className="tile-num">{open.length}</div></div>
      <div className={`tile${open.some(r=>r.overdue)?" alert":""}`}><div className="tile-label">{t("q.overdue")}</div><div className="tile-num">{open.filter(r=>r.overdue).length}</div></div>
      <div className="tile"><div className="tile-label">{t("q.unassigned")}</div><div className="tile-num">{open.filter(r=>!r.assignee_name&&r.status!=="awaiting_approval").length}</div></div>
    </section>
    <RequestList rows={rows} title={t("q.title")} team/>
  </ProtectedPage>;
}
