import { query } from "./db";
export async function getKpis(days=90){
 const [summary,live,statuses,trend,workload,overdue,byType]=await Promise.all([
  query(`SELECT count(*)::int total,count(*) FILTER(WHERE resolved_at IS NOT NULL OR closed_at IS NOT NULL)::int closed,round(100.0*count(*) FILTER(WHERE resolved_at<=sla_due_at)/nullif(count(*) FILTER(WHERE resolved_at IS NOT NULL),0),1) sla_compliance,round(avg(extract(epoch FROM(resolved_at-created_at))/3600) FILTER(WHERE resolved_at IS NOT NULL),1) avg_resolution_hours,round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(resolved_at-created_at))/3600) FILTER(WHERE resolved_at IS NOT NULL))::numeric,1) median_resolution_hours FROM requests WHERE created_at>=now()-($1||' days')::interval`,[days]),
  // Open work is a live count, not limited to the time window.
  query(`SELECT count(*)::int open,count(*) FILTER(WHERE status='awaiting_approval')::int in_approval,count(*) FILTER(WHERE status<>'awaiting_approval')::int with_it,count(*) FILTER(WHERE sla_due_at<now())::int overdue FROM requests WHERE resolved_at IS NULL AND closed_at IS NULL`),
  query(`SELECT status,count(*)::int count FROM requests GROUP BY status ORDER BY count DESC`),
  query(`SELECT to_char(date_trunc('week',created_at),'YYYY-MM-DD') week,type,count(*)::int count FROM requests WHERE created_at>=now()-interval '16 weeks' GROUP BY 1,2 ORDER BY 1`),
  query(`SELECT coalesce(u.name,'Unassigned') agent,count(*)::int open FROM requests r LEFT JOIN users u ON u.id=r.assignee_id WHERE r.resolved_at IS NULL AND r.closed_at IS NULL AND r.status<>'awaiting_approval' GROUP BY u.name ORDER BY open DESC`),
  query(`SELECT r.id,r.type,r.subject,r.company,r.status,r.sla_due_at,r.created_at,floor(extract(epoch FROM(now()-r.sla_due_at))/3600)::int hours_overdue,coalesce(u.name,(SELECT s.approver_name FROM approval_steps s WHERE s.request_id=r.id AND s.status='waiting' ORDER BY s.step_no LIMIT 1)) holder_name FROM requests r LEFT JOIN users u ON u.id=r.assignee_id WHERE r.sla_due_at<now() AND r.resolved_at IS NULL AND r.closed_at IS NULL ORDER BY r.sla_due_at LIMIT 50`),
  query(`SELECT type,count(*)::int total,count(*) FILTER(WHERE resolved_at IS NULL AND closed_at IS NULL)::int open FROM requests GROUP BY type`)
 ]);return {summary:{...summary.rows[0],...live.rows[0]},statuses:statuses.rows,trend:trend.rows,workload:workload.rows,overdue:overdue.rows,byType:byType.rows,generatedAt:new Date().toISOString()};
}
