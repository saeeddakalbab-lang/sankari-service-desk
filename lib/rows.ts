import type { ListRow } from "@/components/RequestList";
import { stepsForRequests } from "./approvals";
import { refFor } from "./format";
import { lineFor } from "./lines";
import type { RequestRecord } from "./types";

// Table rows with their approval lines, loaded with one extra query for all steps.
export async function toRows(requests:RequestRecord[]):Promise<ListRow[]>{
  const steps=await stepsForRequests(requests.filter(r=>r.approval_required).map(r=>r.id));
  const now=Date.now();
  return requests.map(r=>({
    id:r.id,ref:refFor(r.type,r.id,String(r.created_at)),subject:r.subject,type:r.type,created_at:String(r.created_at),status:r.status,
    requester_name:r.requester_name,assignee_name:r.assignee_name??null,
    overdue:!r.resolved_at&&!r.closed_at&&new Date(r.sla_due_at).getTime()<now,
    line:lineFor(r,steps.get(r.id)),
  }));
}
