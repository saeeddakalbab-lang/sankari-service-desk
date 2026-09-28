import { query } from "./db";
import type { RequestType } from "./types";

export type StuckRow={id:string;type:RequestType;subject:string;created_at:string;requester_user_id:string|null;status:string;priority:string;sla_due_at:string;stage:"approval"|"fulfilment";step_no:number|null;step_id:string|null;approver_role:"manager"|"ceo"|null;holder_id:string|null;holder_name:string|null;since:string};

// Every open request, where it is waiting and since when. Longest wait first.
// In approval: the clock starts when the previous step was decided (or at submission).
// In fulfilment: it starts when the last approval landed (or at submission for requests with no approval line).
export async function listStuck(limit=200){
  const rows=await query<StuckRow>(`
    WITH cur AS (
      SELECT DISTINCT ON (s.request_id) s.id,s.request_id,s.step_no,s.approver_role,s.approver_user_id,s.approver_name
        FROM approval_steps s
       WHERE s.status='waiting' AND NOT EXISTS (SELECT 1 FROM approval_steps x WHERE x.request_id=s.request_id AND x.status='rejected')
       ORDER BY s.request_id,s.step_no),
    decided AS (SELECT request_id,max(decided_at) at FROM approval_steps WHERE status IN ('approved','skipped') GROUP BY request_id)
    SELECT r.id,r.type,r.subject,r.status,r.priority,r.sla_due_at,r.created_at,r.requester_user_id,
           CASE WHEN r.status='awaiting_approval' THEN 'approval' ELSE 'fulfilment' END stage,
           cur.step_no,cur.approver_role,cur.id step_id,
           CASE WHEN r.status='awaiting_approval' THEN cur.approver_user_id ELSE r.assignee_id END holder_id,
           CASE WHEN r.status='awaiting_approval' THEN cur.approver_name ELSE u.name END holder_name,
           coalesce(d.at,r.created_at) since
      FROM requests r
      LEFT JOIN cur ON cur.request_id=r.id
      LEFT JOIN decided d ON d.request_id=r.id
      LEFT JOIN users u ON u.id=r.assignee_id
     WHERE r.resolved_at IS NULL AND r.closed_at IS NULL
     ORDER BY coalesce(d.at,r.created_at) ASC
     LIMIT $1`,[limit]);
  const all=rows.rows,now=Date.now();
  return {
    rows:all,
    counts:{open:all.length,approval:all.filter(r=>r.stage==="approval").length,fulfilment:all.filter(r=>r.stage==="fulfilment").length,overdue:all.filter(r=>new Date(r.sla_due_at).getTime()<now).length},
    generatedAt:new Date().toISOString()
  };
}
