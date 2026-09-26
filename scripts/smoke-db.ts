import { getKpis } from "../lib/kpi";
import { pool,query } from "../lib/db";

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
console.log("Database migration and KPI queries verified.");
await pool.end();
