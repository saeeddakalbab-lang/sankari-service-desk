import { query } from "./db";
export async function getKpis(days=90){
 const [summary,statuses,trend,workload,overdue,byType]=await Promise.all([
  query(`SELECT count(*)::int total,count(*) FILTER(WHERE resolved_at IS NULL AND closed_at IS NULL)::int open,count(*) FILTER(WHERE resolved_at IS NOT NULL OR closed_at IS NOT NULL)::int closed,round(100.0*count(*) FILTER(WHERE resolved_at<=sla_due_at)/nullif(count(*) FILTER(WHERE resolved_at IS NOT NULL),0),1) sla_compliance,round(avg(extract(epoch FROM(resolved_at-created_at))/3600) FILTER(WHERE resolved_at IS NOT NULL),1) avg_resolution_hours,round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(resolved_at-created_at))/3600) FILTER(WHERE resolved_at IS NOT NULL))::numeric,1) median_resolution_hours FROM requests WHERE created_at>=now()-($1||' days')::interval`,[days]),
  query(`SELECT status,count(*)::int count FROM requests GROUP BY status ORDER BY count DESC`),
  query(`SELECT date_trunc('week',created_at)::date week,type,count(*)::int count FROM requests WHERE created_at>=now()-interval '16 weeks' GROUP BY 1,2 ORDER BY 1`),
  query(`SELECT coalesce(u.name,'Unassigned') agent,count(*)::int open FROM requests r LEFT JOIN users u ON u.id=r.assignee_id WHERE r.resolved_at IS NULL AND r.closed_at IS NULL GROUP BY u.name ORDER BY open DESC`),
  query(`SELECT id,type,subject,company,status,sla_due_at,ceil(extract(epoch FROM(now()-sla_due_at))/86400)::int days_overdue FROM requests WHERE sla_due_at<now() AND resolved_at IS NULL AND closed_at IS NULL ORDER BY sla_due_at LIMIT 50`),
  query(`SELECT type,count(*)::int total,count(*) FILTER(WHERE resolved_at IS NULL AND closed_at IS NULL)::int open FROM requests GROUP BY type`)
 ]);return {summary:summary.rows[0],statuses:statuses.rows,trend:trend.rows,workload:workload.rows,overdue:overdue.rows,byType:byType.rows,generatedAt:new Date().toISOString()};
}
