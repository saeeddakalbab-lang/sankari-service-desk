import { getKpis } from "../lib/kpi";
import { pool,query } from "../lib/db";

const tables=await query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','requests','comments','audit_log','email_outbox','jira_issues','migration_staging')`);
if(tables.rowCount!==7)throw new Error(`Expected 7 core tables, found ${tables.rowCount}`);
const kpis=await getKpis();
if(kpis.summary.total!==0)throw new Error("Fresh database should contain no requests");
const client=await pool.connect();
try{
  await client.query("BEGIN");
  const values=["helpdesk_ticket","Test User","user@sankari-holding.com","IT","Sankari","Smoke request","Database verification","medium","new"];
  await client.query(`INSERT INTO requests(type,requester_name,requester_email,department,company,subject,description,priority,status,sla_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '72 hours')`,values);
  await client.query(`INSERT INTO requests(type,requester_name,requester_email,department,company,subject,description,priority,status,sla_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '72 hours')`,values);
  await client.query("ROLLBACK");
}finally{client.release();}
console.log("Database migration and KPI queries verified.");
await pool.end();
