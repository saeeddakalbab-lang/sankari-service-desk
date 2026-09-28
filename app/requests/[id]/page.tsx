import { notFound,redirect } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { RequestDetail } from "@/components/RequestDetail";
import { listSteps } from "@/lib/approvals";
import { query } from "@/lib/db";
import { refFor } from "@/lib/format";
import { lineFor } from "@/lib/lines";
import { canManage,getRequest,listComments } from "@/lib/requests";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Detail({params}:{params:Promise<{id:string}>}){
  const {user}=await getViewer();if(!user)redirect("/login");
  const {id}=await params;if(!UUID.test(id))notFound();
  // getRequest enforces visibility: requester, an approver on its chain, or the IT team.
  const [request,comments,agents]=await Promise.all([getRequest(id,user),listComments(id,user),query<{id:string;name:string}>(`SELECT id,name FROM users WHERE roles&&ARRAY['agent','admin']::text[] AND disabled_at IS NULL ORDER BY name`)]);
  if(!request||!comments)notFound();
  const steps=request.approval_required?await listSteps(id):[];
  // Every status change and assignment, so the thread shows the whole path from submission to closed.
  const changes=(await query<{at:string;who:string|null;action:string;status_before:string|null;status:string|null;assignee_before:string|null;assignee:string|null;assignee_name:string|null}>(
    `SELECT a.created_at at,u.name who,a.action,a.before_data->>'status' status_before,a.after_data->>'status' status,a.before_data->>'assignee_id' assignee_before,a.after_data->>'assignee_id' assignee,n.name assignee_name
       FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN users n ON n.id::text=a.after_data->>'assignee_id'
      WHERE a.request_id=$1 AND a.action IN ('request.transition','ticket.email_start','ticket.email_reject') ORDER BY a.created_at`,[id])).rows;
  const plain=JSON.parse(JSON.stringify({request,comments,steps,changes}));
  return <ProtectedPage><RequestDetail request={plain.request} refCode={refFor(request.type,request.id,String(request.created_at))} line={lineFor(plain.request,plain.steps)} decisions={plain.steps} comments={plain.comments} changes={plain.changes} canManage={canManage(user)} agents={agents.rows} renderedAt={Date.now()}/></ProtectedPage>;
}
