import { getKpis } from "../lib/kpi";
import { getJiraIssues,getJiraOverview } from "../lib/jira";
import { pool,query } from "../lib/db";
import { contractDocument } from "../lib/contract-docs";

const requiredTables=["users","requests","comments","audit_log","email_outbox","jira_issues","migration_staging","settings","companies","services","subscriptions","purchase_requests","contracts","contract_line_items","invoices","payables","ledger_entries","contract_assignments"];
const tables=await query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,[requiredTables]);
if(tables.rowCount!==requiredTables.length){
  const found=new Set(tables.rows.map(r=>r.table_name));
  const missing=requiredTables.filter(t=>!found.has(t));
  throw new Error(`Expected ${requiredTables.length} platform tables, missing ${missing.join(", ")}`);
}
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
await query(`INSERT INTO subscriptions(name,card_last4) VALUES('Valid card sample','4471')`);
try{
  // Bound parameter, as the app sends it: PostgreSQL logs failing statement text, not parameters.
  await query(`INSERT INTO subscriptions(name,card_last4) VALUES('Invalid card sample',$1)`,["4111111111111111"]);
  throw new Error("Full card number was accepted");
}catch(e){
  if(e instanceof Error && e.message==="Full card number was accepted")throw e;
}
await query(`DELETE FROM subscriptions WHERE name IN ('Valid card sample','Invalid card sample')`);
const invoiceClient=await pool.connect();
try{
  await invoiceClient.query("BEGIN");
  const contract=await invoiceClient.query<{id:string}>(`INSERT INTO contracts(reference,company_name,contact_name,contact_email,support_type,requested_start_date,duration_months,subtotal_cents,total_cents,pricing_snapshot) VALUES('SMOKE-CT-1','Smoke Co','Smoke Contact','smoke@example.com','remote',current_date,6,10000,10000,'{}'::jsonb) RETURNING id`);
  const id=contract.rows[0].id;
  await invoiceClient.query(`INSERT INTO invoices(contract_id,reference,installment,share_bps,amount_cents,due_trigger) VALUES($1,'SMOKE-INV-1','signing',5000,5000,'on_signing')`,[id]);
  await invoiceClient.query(`INSERT INTO invoices(contract_id,reference,installment,share_bps,amount_cents,due_trigger) VALUES($1,'SMOKE-INV-2','midpoint',2500,2500,'contract_midpoint')`,[id]);
  await invoiceClient.query(`INSERT INTO invoices(contract_id,reference,installment,share_bps,amount_cents,due_trigger) VALUES($1,'SMOKE-INV-3','final',2500,2499,'contract_end')`,[id]);
  await invoiceClient.query("COMMIT");
  throw new Error("Mismatched installment total was accepted");
}catch(e){
  await invoiceClient.query("ROLLBACK");
  if(e instanceof Error && e.message==="Mismatched installment total was accepted")throw e;
}finally{invoiceClient.release();}
// The contract document and invoice are built from a saved contract: one submitted sample with client
// details and two services, then removed. The details freeze with the price once approved (019),
// checked inside a transaction that is rolled back.
const docId = (await query<{ id: string }>(`INSERT INTO contracts(reference,company_name,contact_name,contact_email,contact_phone,support_type,requested_start_date,duration_months,subtotal_cents,total_cents,pricing_snapshot,client_details)
  VALUES('SMOKE-CT-DOC','Smoke Co','Smoke Contact','smoke@example.com','+963 11 000','onsite',current_date,6,1950000,1950000,'{}'::jsonb,$1) RETURNING id`, [JSON.stringify({ title: "المدير العام", address: "دمشق – الشعلان", city: "دمشق" })])).rows[0].id;
try {
  for (const [k, h, m, t] of [["consultant", 96, 175000, 1050000], ["it_support", 192, 150000, 900000]] as const)
    await query(`INSERT INTO contract_line_items(contract_id,service_key,service_label,hours_per_month,base_salary_cents,flat_cost_cents,multiplier,standard_hours,monthly_full_time_cents,monthly_price_cents,line_total_cents,weeks_per_month,days_per_week) VALUES($1,$2,$2,$3,0,0,3,192,0,$4,$5,$6,6)`, [docId, k, h, m, t, h / 48]);
  const x = await contractDocument(docId);
  if (!x || x.doc.sections.length !== 19 || x.doc.controlNo !== "SH-IT-MS" || !JSON.stringify(x.doc).includes("دمشق – الشعلان")) throw new Error("Contract document was not built from the saved contract");
  const plan = x.doc.sections[6].blocks.find(b => b.kind === "table");
  if (!plan || plan.kind !== "table" || plan.total?.[2] !== "19,500.00") throw new Error(`Contract payment plan is wrong: ${JSON.stringify(plan)}`);
} finally { await query(`DELETE FROM contracts WHERE id=$1`, [docId]); }
const freeze = await pool.connect();
try {
  await freeze.query("BEGIN");
  const id = (await freeze.query<{ id: string }>(`INSERT INTO contracts(reference,company_name,contact_name,contact_email,support_type,requested_start_date,duration_months,subtotal_cents,total_cents,pricing_snapshot,status) VALUES('SMOKE-CT-FRZ','Smoke Co','Smoke','smoke@example.com','remote',current_date,6,100,100,'{}'::jsonb,'submitted') RETURNING id`)).rows[0].id;
  await freeze.query(`UPDATE contracts SET status='approved' WHERE id=$1`, [id]);
  await freeze.query("SAVEPOINT s");
  try { await freeze.query(`UPDATE contracts SET client_details='{"title":"changed"}'::jsonb WHERE id=$1`, [id]); throw new Error("Client details changed after approval"); }
  catch (e) { if (e instanceof Error && e.message === "Client details changed after approval") throw e; await freeze.query("ROLLBACK TO SAVEPOINT s"); }
} finally { await freeze.query("ROLLBACK"); freeze.release(); }
// The Jira overview is all aggregate SQL: run it empty, then with sample rows (a done issue with a
// resolution date, an overdue one, an unassigned one with an empty date), then remove the samples.
for(const d of [30,90,0])await getJiraOverview(d);
await query(`INSERT INTO jira_issues(issue_key,project_key,summary,status,status_category,assignee_email,assignee_name,due_date,issue_url,raw,jira_updated_at) VALUES
  ('SMK-1','SMK','a','Done','Done',NULL,'Smoke A',current_date,'u',$1,now()),
  ('SMK-2','SMK','b','In Progress','In Progress',NULL,'Smoke A',current_date-1,'u',$3,now()),
  ('SMK-3','SMK','c','To Do','To Do',NULL,NULL,NULL,'u',$2,now())`,[JSON.stringify({fields:{resolutiondate:new Date().toISOString().replace("Z","+0000"),assignee:{accountId:"acc-a"}}}),JSON.stringify({fields:{resolutiondate:""}}),JSON.stringify({fields:{assignee:{accountId:"acc-a"}}})]);
try{
  const o=await getJiraOverview(30),smk=o.spaces.find(s=>s.key==="SMK"),a=o.team.find(p=>p.id==="acc-a");
  if(!smk||smk.total!==3||smk.done!==1||smk.inProgress!==1||smk.todo!==1||smk.overdue!==1)throw new Error(`Jira space counts are wrong: ${JSON.stringify(smk)}`);
  if(!a||a.doneInPeriod!==1||a.assigned!==2||a.overdue!==1||a.onTime!==1)throw new Error(`Jira team counts are wrong: ${JSON.stringify(a)}`);
  if((await getJiraIssues("nobody@example.test","Smoke A")).issues.length!==2)throw new Error("My tasks does not match by the Jira display name");
}finally{await query(`DELETE FROM jira_issues WHERE issue_key IN ('SMK-1','SMK-2','SMK-3')`);}
console.log("Database migration, KPI and Jira queries verified.");
await pool.end();
