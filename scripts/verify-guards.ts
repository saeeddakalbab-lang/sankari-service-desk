// Exercises the database hard constraints directly, bypassing the application, the way a
// careless psql session or a buggy import would. Everything runs in one transaction that is
// always rolled back, so it is safe against any database and leaves no rows behind.
import { pool } from "../lib/db";
import { splitInstallments } from "../lib/money";

const c = await pool.connect();
let failures = 0;
const ok = (label: string) => console.log(`PASS ${label}`);
const bad = (label: string, why: string) => { failures++; console.log(`FAIL ${label}: ${why}`); };
async function refused(label: string, sql: string, values: unknown[] = [], mustNotEcho?: string) {
  await c.query("SAVEPOINT t");
  try { await c.query(sql, values); await c.query("SET CONSTRAINTS ALL IMMEDIATE"); await c.query("SET CONSTRAINTS ALL DEFERRED"); bad(label, "was accepted"); }
  catch (e) {
    const err = e as { message: string; detail?: string };
    if (mustNotEcho && `${err.message} ${err.detail ?? ""}`.replace(/\D/g, "").includes(mustNotEcho)) bad(label, "error echoed the card number");
    else ok(`${label} -> refused (${err.message})`);
  }
  finally { await c.query("ROLLBACK TO SAVEPOINT t"); }
}
async function accepted(label: string, sql: string, values: unknown[] = []) {
  await c.query("SAVEPOINT t");
  try { const r = await c.query(sql, values); await c.query("SET CONSTRAINTS ALL IMMEDIATE"); await c.query("SET CONSTRAINTS ALL DEFERRED"); await c.query("RELEASE SAVEPOINT t"); ok(label); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT t"); bad(label, (e as Error).message); return null; }
}

try {
  await c.query("BEGIN");
  const u = async (email: string, roles: string[], manager: string | null = null) =>
    (await c.query<{ id: string }>(`INSERT INTO users(email,name,roles,manager_user_id) VALUES($1,$1,$2,$3) RETURNING id`, [email, roles, manager])).rows[0].id;

  console.log("== Card data: last 4 only");
  // Values are bound parameters, exactly as the app sends them, so PostgreSQL never logs them.
  const PAN = "4000056655665556";
  await refused("16-digit PAN", `INSERT INTO subscriptions(name,card_last4) VALUES('guard',$1)`, [PAN], PAN);
  await refused("PAN with spaces", `INSERT INTO subscriptions(name,card_last4) VALUES('guard',$1)`, ["4000 0566 5566 5556"], PAN);
  await refused("PAN with dashes", `INSERT INTO subscriptions(name,card_last4) VALUES('guard',$1)`, ["4000-0566-5566-5556"], PAN);
  await refused("5 digits", `INSERT INTO subscriptions(name,card_last4) VALUES('guard','14471')`);
  const sub = (await c.query<{ id: string }>(`INSERT INTO subscriptions(name,card_last4) VALUES('guard','4471') RETURNING id`)).rows[0].id;
  await refused("PAN via UPDATE", `UPDATE subscriptions SET card_last4=$2 WHERE id=$1`, [sub, PAN], PAN);
  const stored = await accepted("masked input is stripped to digits", `INSERT INTO subscriptions(name,card_last4) VALUES('guard','•••• 4471') RETURNING card_last4`);
  if (stored && stored.rows[0].card_last4 !== "4471") bad("stored value", `got ${stored.rows[0].card_last4}`);
  await accepted("empty card is allowed (non-card payment)", `INSERT INTO subscriptions(name,card_last4) VALUES('guard','')`);

  console.log("== Installments: exact split, final is the residual");
  for (const total of [1n, 2n, 3n, 10001n, 99999n, 123456789n]) {
    const db = (await c.query<{ first_cents: string; second_cents: string; final_cents: string }>(`SELECT * FROM installment_split($1,5000,2500)`, [total.toString()])).rows[0];
    const ts = splitInstallments(total, 5000, 2500);
    const sum = BigInt(db.first_cents) + BigInt(db.second_cents) + BigInt(db.final_cents);
    if (sum !== total) bad(`split ${total}`, `sums to ${sum}`);
    else if (BigInt(db.first_cents) !== ts.firstCents || BigInt(db.final_cents) !== ts.finalCents) bad(`split ${total}`, "SQL and TypeScript disagree");
    else ok(`split ${total} -> ${db.first_cents}+${db.second_cents}+${db.final_cents}`);
  }
  const ct = (await c.query<{ id: string }>(`INSERT INTO contracts(reference,company_name,contact_name,contact_email,support_type,requested_start_date,duration_months,subtotal_cents,total_cents,pricing_snapshot,sample)
      VALUES('GUARD-CT-1','Guard Co','Guard','guard@example.com','remote',current_date,6,10001,10001,'{}',true) RETURNING id`)).rows[0].id;
  await accepted("uneven contract (100.01) invoices commit with the residual split", `INSERT INTO invoices(contract_id,reference,installment,share_bps,amount_cents,due_trigger)
      SELECT $1,'GUARD-INV-'||k,k::installment_kind,b,a,'t' FROM installment_split(10001,5000,2500) s,
      LATERAL (VALUES('signing',5000,s.first_cents),('midpoint',2500,s.second_cents),('final',2500,s.final_cents)) v(k,b,a)`, [ct]);
  const sum = (await c.query(`SELECT sum(amount_cents)::bigint s FROM invoices WHERE contract_id=$1`, [ct])).rows[0].s;
  if (sum !== "10001") bad("invoice sum", `got ${sum}`); else ok("invoices sum exactly to 10001");
  await refused("invoice edit that breaks the sum", `UPDATE invoices SET amount_cents=amount_cents+1 WHERE contract_id=$1 AND installment='final'`, [ct]);

  console.log("== Approval line, enforced by the database");
  const chair = await u("guard.chair@sankari-holding.com", ["employee"]);
  const ceo = await u("guard.ceo@sankari-holding.com", ["employee"], chair);
  const mgr = await u("guard.mgr@sankari-holding.com", ["employee"], ceo);
  const emp = await u("guard.emp@sankari-holding.com", ["employee"], mgr);
  const newReq = async () => (await c.query<{ id: string }>(`INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,status,sla_due_at,approval_required)
      VALUES('email_account_request',$1,'Guard Emp','guard.emp@sankari-holding.com','IT','Sankari','Guard','Guard','awaiting_approval',now()+interval '1 day',true) RETURNING id`, [emp])).rows[0].id;
  const steps = async (id: string) => { await c.query(`INSERT INTO approval_steps(request_id,step_no,approver_user_id,approver_role,approver_name) VALUES($1,1,$2,'manager','Guard Mgr'),($1,2,$3,'ceo','Guard CEO')`, [id, mgr, ceo]); };

  await refused("approval request with no approvers (auto-approve hole)", `INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,status,sla_due_at,approval_required)
      VALUES('email_account_request',$1,'x','x@x','IT','S','x','x','awaiting_approval',now(),true)`, [emp]);
  await refused("approval request created already approved", `INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,status,sla_due_at,approval_required)
      VALUES('email_account_request',$1,'x','x@x','IT','S','x','x','approved',now(),true)`, [emp]);
  const r = await newReq(); await steps(r);
  await refused("requester as their own approver", `INSERT INTO approval_steps(request_id,step_no,approver_user_id,approver_role,approver_name) VALUES($1,3,$2,'ceo','self')`, [r, emp]);
  await refused("hand-set status approved", `UPDATE requests SET status='approved' WHERE id=$1`, [r]);
  await refused("fulfil while awaiting approval", `UPDATE requests SET status='inprogress' WHERE id=$1`, [r]);
  await refused("assign for fulfilment while awaiting approval", `UPDATE requests SET assignee_id=$2 WHERE id=$1`, [r, mgr]);
  await refused("turn the approval line off on a request", `UPDATE requests SET approval_required=false WHERE id=$1`, [r]);
  await refused("CEO decides before the manager (skip ahead)", `UPDATE approval_steps SET status='approved',decided_at=now() WHERE request_id=$1 AND step_no=2`, [r]);
  await refused("reject without a reason", `UPDATE approval_steps SET status='rejected',decided_at=now() WHERE request_id=$1 AND step_no=1`, [r]);
  await refused("rewrite the chain after submission", `UPDATE approval_steps SET approver_user_id=$2 WHERE request_id=$1 AND step_no=1`, [r, chair]);
  await refused("delete an approval step", `DELETE FROM approval_steps WHERE request_id=$1`, [r]);
  await accepted("manager approves step 1", `UPDATE approval_steps SET status='approved',decided_at=now(),comment='ok' WHERE request_id=$1 AND step_no=1`, [r]);
  await refused("change a decision already made", `UPDATE approval_steps SET status='rejected',comment='changed mind' WHERE request_id=$1 AND step_no=1`, [r]);
  const mid = (await c.query(`SELECT status FROM requests WHERE id=$1`, [r])).rows[0].status;
  mid === "awaiting_approval" ? ok("status derived: awaiting_approval after step 1") : bad("derived status", mid);
  await accepted("CEO approves step 2", `UPDATE approval_steps SET status='approved',decided_at=now() WHERE request_id=$1 AND step_no=2`, [r]);
  const done = (await c.query(`SELECT status FROM requests WHERE id=$1`, [r])).rows[0].status;
  done === "approved" ? ok("status derived: approved after both steps") : bad("derived status", done);
  await accepted("fulfilment allowed once approved", `UPDATE requests SET status='inprogress',assignee_id=$2 WHERE id=$1`, [r, chair]);

  const r2 = await newReq(); await steps(r2);
  await accepted("manager rejects with reason", `UPDATE approval_steps SET status='rejected',decided_at=now(),comment='no budget' WHERE request_id=$1 AND step_no=1`, [r2]);
  const rej = (await c.query(`SELECT status,closed_at IS NOT NULL closed FROM requests WHERE id=$1`, [r2])).rows[0];
  rej.status === "rejected" && rej.closed ? ok("status derived: rejected and closed") : bad("rejected status", JSON.stringify(rej));
  await refused("CEO approves after rejection (never skips ahead)", `UPDATE approval_steps SET status='approved',decided_at=now() WHERE request_id=$1 AND step_no=2`, [r2]);
  await refused("reopen a rejected request by hand", `UPDATE requests SET status='reopened' WHERE id=$1`, [r2]);

  console.log("== Skipping a silent approver");
  const board = await u("guard.board@sankari-holding.com", ["employee", "board"]);
  const skip = (id: string, by: string, reason: string | null, step = 1) =>
    [`UPDATE approval_steps SET status='skipped',decided_at=now(),skipped_by_user_id=$2,skip_reason=$3 WHERE request_id=$1 AND step_no=$4`, [id, by, reason, step]] as [string, unknown[]];
  const r3 = await newReq(); await steps(r3);
  await refused("skip before the threshold", ...skip(r3, board, "no answer"));
  await c.query(`UPDATE requests SET created_at=now()-interval '49 hours' WHERE id=$1`, [r3]);
  await refused("skip by the requester", ...skip(r3, emp, "no answer"));
  await refused("skip by an employee without the role", ...skip(r3, chair, "no answer"));
  await refused("skip by the step's own approver", ...skip(r3, mgr, "no answer"));
  await refused("skip with an empty reason", ...skip(r3, board, "  "));
  await refused("skip the second step before the first", ...skip(r3, board, "no answer", 2));
  await accepted("Board member skips a step silent for 49h", ...skip(r3, board, "Manager on leave, no delegate"));
  const afterSkip = (await c.query(`SELECT status FROM requests WHERE id=$1`, [r3])).rows[0].status;
  afterSkip === "awaiting_approval" ? ok("status derived: still awaiting the CEO") : bad("after skip", afterSkip);
  await refused("skip the CEO step straight away (its clock starts at the skip)", ...skip(r3, board, "no answer", 2));
  await refused("change a skip into an approval", `UPDATE approval_steps SET status='approved',skipped_by_user_id=NULL,skip_reason=NULL WHERE request_id=$1 AND step_no=1`, [r3]);
  await accepted("CEO approves after the skip", `UPDATE approval_steps SET status='approved',decided_at=now() WHERE request_id=$1 AND step_no=2`, [r3]);
  const skippedDone = (await c.query(`SELECT status FROM requests WHERE id=$1`, [r3])).rows[0].status;
  skippedDone === "approved" ? ok("status derived: approved with one skipped step") : bad("after skip + approve", skippedDone);

  console.log("== Email action links");
  const h = (n: number) => n.toString(16).padStart(64, "0");
  const tok = (hash: string, reqId: string, who: string, expires = "now()+interval '72 hours'") =>
    [`INSERT INTO action_tokens(token_hash,action,request_id,recipient_user_id,expires_at) VALUES($1,'ticket.start',$2,$3,${expires}) RETURNING id`, [hash, reqId, who]] as [string, unknown[]];
  await refused("store a raw token instead of a hash", ...tok("plain-token-value", r3, mgr));
  await refused("link that expires before it is issued", ...tok(h(1), r3, mgr, "now()-interval '1 minute'"));
  await accepted("store a hashed link for the agent", ...tok(h(2), r3, mgr));
  await refused("link used by someone other than its recipient", `UPDATE action_tokens SET used_at=now(),used_by_user_id=$2 WHERE token_hash=$1`, [h(2), emp]);
  await accepted("recipient uses the link", `UPDATE action_tokens SET used_at=now(),used_by_user_id=$2 WHERE token_hash=$1`, [h(2), mgr]);
  await refused("use the same link twice", `UPDATE action_tokens SET used_at=now(),used_by_user_id=$2 WHERE token_hash=$1`, [h(2), mgr]);
  await refused("clear used_at to reuse a link", `UPDATE action_tokens SET used_at=NULL,used_by_user_id=NULL WHERE token_hash=$1`, [h(2)]);
  await c.query(`INSERT INTO action_tokens(token_hash,action,request_id,recipient_user_id,created_at,expires_at) VALUES($1,'ticket.start',$2,$3,now()-interval '73 hours',now()-interval '1 hour')`, [h(3), r3, mgr]);
  await refused("use an expired link", `UPDATE action_tokens SET used_at=now(),used_by_user_id=$2 WHERE token_hash=$1`, [h(3), mgr]);
  await refused("extend an expired link", `UPDATE action_tokens SET expires_at=now()+interval '1 day' WHERE token_hash=$1`, [h(3)]);

  console.log("== Renewals and bills");
  const subReq = (await c.query<{ id: string }>(`INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,status,sla_due_at,approval_required)
      VALUES('subscription_approval',$1,'Guard Emp','guard.emp@sankari-holding.com','IT','Sankari','Guard tool','Guard','approved',now()+interval '1 day',false) RETURNING id`, [emp])).rows[0].id;
  const gsub = (await c.query<{ id: string }>(`INSERT INTO subscriptions(name,amount_cents,currency,card_last4,owner_user_id,request_id,renewal_date,billing_frequency) VALUES('guard tool',9600,'USD','4471',$1,$2,current_date+10,'annual') RETURNING id`, [emp, subReq])).rows[0].id;
  const bill = (kind: string, extra: string, vals: unknown[]) =>
    [`INSERT INTO subscription_bills(subscription_id,kind,tool,amount_cents,currency,usd_to_aed_rate,amount_aed_cents,card_last4${extra ? "," + extra : ""}) VALUES($1,'${kind}','guard tool',9600,'USD',3.6725,35256,$2${vals.length ? "," + vals.map((_, i) => `$${i + 3}`).join(",") : ""}) RETURNING id`, [gsub, "4471", ...vals]] as [string, unknown[]];
  await refused("first bill without an approved request", ...bill("initial", "", []));
  const pendingReq = await newReq(); await steps(pendingReq);
  await refused("first bill on a request still awaiting approval", ...bill("initial", "request_id", [pendingReq]));
  await refused("bill with a full card number", `INSERT INTO subscription_bills(subscription_id,kind,request_id,tool,amount_cents,currency,usd_to_aed_rate,amount_aed_cents,card_last4) VALUES($1,'initial',$2,'guard tool',9600,'USD',3.6725,35256,$3)`, [gsub, subReq, PAN], PAN);
  await refused("AED bill whose AED amount differs", `INSERT INTO subscription_bills(subscription_id,kind,request_id,tool,amount_cents,currency,usd_to_aed_rate,amount_aed_cents) VALUES($1,'initial',$2,'guard tool',9600,'AED',1,9601)`, [gsub, subReq]);
  const firstBill = await accepted("first bill on the approved request", ...bill("initial", "request_id", [subReq]));
  await refused("second first bill for the same subscription", ...bill("initial", "request_id", [subReq]));
  await refused("edit a bill", `UPDATE subscription_bills SET amount_cents=1 WHERE subscription_id=$1`, [gsub]);
  await refused("delete a bill", `DELETE FROM subscription_bills WHERE subscription_id=$1`, [gsub]);
  void firstBill;
  const ren = (await c.query<{ id: string }>(`INSERT INTO subscription_renewals(subscription_id,renewal_date,owner_user_id) VALUES($1,current_date+10,$2) RETURNING id`, [gsub, emp])).rows[0].id;
  await refused("renewal bill with no decision (auto-renew)", ...bill("renewal", "renewal_id", [ren]));
  await refused("flag a renewal before its date", `UPDATE subscription_renewals SET flagged_at=now() WHERE id=$1`, [ren]);
  await refused("someone other than the owner decides", `UPDATE subscription_renewals SET decision='renew',decided_by_user_id=$2,decided_at=now() WHERE id=$1`, [ren, mgr]);
  await accepted("owner declines", `UPDATE subscription_renewals SET decision='decline',decided_by_user_id=$2,decided_at=now() WHERE id=$1`, [ren, emp]);
  await refused("renewal bill after a decline", ...bill("renewal", "renewal_id", [ren]));
  await refused("change a decline into a renew", `UPDATE subscription_renewals SET decision='renew' WHERE id=$1`, [ren]);
  const ren2 = (await c.query<{ id: string }>(`INSERT INTO subscription_renewals(subscription_id,renewal_date,owner_user_id) VALUES($1,current_date-1,$2) RETURNING id`, [gsub, emp])).rows[0].id;
  await accepted("flag an unanswered renewal past its date", `UPDATE subscription_renewals SET flagged_at=now() WHERE id=$1`, [ren2]);
  await refused("clear the flag", `UPDATE subscription_renewals SET flagged_at=NULL WHERE id=$1`, [ren2]);
  await accepted("owner renews late", `UPDATE subscription_renewals SET decision='renew',decided_by_user_id=$2,decided_at=now() WHERE id=$1`, [ren2, emp]);
  await accepted("renewal bill after the owner's renew", ...bill("renewal", "renewal_id", [ren2]));
  await refused("second bill for the same renewal", ...bill("renewal", "renewal_id", [ren2]));

  console.log("== Monthly statement");
  await refused("payment of zero", `INSERT INTO statement_credits(occurred_on,kind,amount_aed_cents) VALUES(current_date,'payment',0)`);
  await refused("unknown credit kind", `INSERT INTO statement_credits(occurred_on,kind,amount_aed_cents) VALUES(current_date,'gift',100)`);
  await accepted("record a card payment", `INSERT INTO statement_credits(occurred_on,kind,amount_aed_cents,description) VALUES(current_date,'payment',50000,'guard')`);
  await refused("edit a payment", `UPDATE statement_credits SET amount_aed_cents=1 WHERE description='guard'`);
  await refused("delete a payment", `DELETE FROM statement_credits WHERE description='guard'`);
  await refused("statement whose closing does not add up", `INSERT INTO monthly_statements(month,opening_aed_cents,charges_aed_cents,credits_aed_cents,closing_aed_cents,lines) VALUES('2020-01-01',100,50,20,131,1)`);
  await refused("statement dated mid-month", `INSERT INTO monthly_statements(month,opening_aed_cents,charges_aed_cents,credits_aed_cents,closing_aed_cents,lines) VALUES('2020-01-15',100,50,20,130,1)`);
  await accepted("statement that balances", `INSERT INTO monthly_statements(month,opening_aed_cents,charges_aed_cents,credits_aed_cents,closing_aed_cents,lines) VALUES('2020-01-01',100,50,20,130,1)`);
  await accepted("an email can wait as held", `INSERT INTO email_outbox(event_key,recipient,subject,html,text_body,state) VALUES('guard-held','x@sankari-holding.com','s','h','t','held')`);
  await refused("unknown email state", `INSERT INTO email_outbox(event_key,recipient,subject,html,text_body,state) VALUES('guard-bad','x@sankari-holding.com','s','h','t','queued')`);

  console.log("== Contracts, invoices, ledger");
  await refused("contract jumps from submitted to active", `UPDATE contracts SET status='active',start_date=current_date,end_date=current_date+180 WHERE id=$1`, [ct]);
  await refused("reject a contract without a reason", `UPDATE contracts SET status='rejected' WHERE id=$1`, [ct]);
  await accepted("add a priced line while under review", `INSERT INTO contract_line_items(contract_id,service_key,service_label,hours_per_month,base_salary_cents,flat_cost_cents,multiplier,standard_hours,monthly_full_time_cents,monthly_price_cents,line_total_cents)
      VALUES($1,'devops','DevOps',80,100000,100000,3,160,600000,300000,1800000)`, [ct]);
  await accepted("approve the contract", `UPDATE contracts SET status='approved' WHERE id=$1`, [ct]);
  await refused("change the price after approval", `UPDATE contracts SET total_cents=total_cents+1,subtotal_cents=subtotal_cents+1 WHERE id=$1`, [ct]);
  await refused("change a line after approval", `DELETE FROM contract_line_items WHERE contract_id=$1`, [ct]);
  await accepted("send the contract", `UPDATE contracts SET status='contract_sent',contract_sent_at=now() WHERE id=$1`, [ct]);
  await refused("mark signed with no evidence", `UPDATE contracts SET status='signed' WHERE id=$1`, [ct]);
  await accepted("mark signed with the client's confirmation", `UPDATE contracts SET status='signed',signed_at=now(),signed_evidence='Email from client 25/09' WHERE id=$1`, [ct]);
  await refused("activate without start and end dates", `UPDATE contracts SET status='active' WHERE id=$1`, [ct]);
  await refused("delete an invoice", `DELETE FROM invoices WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await accepted("send the signing invoice", `UPDATE invoices SET status='sent',sent_at=now() WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await refused("change a sent invoice's amount", `UPDATE invoices SET amount_cents=amount_cents+1 WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await refused("mark paid without the amount received", `UPDATE invoices SET status='paid' WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await accepted("mark the signing invoice paid", `UPDATE invoices SET status='paid',paid_at=now(),paid_amount_cents=amount_cents WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await refused("un-pay a paid invoice", `UPDATE invoices SET status='sent' WHERE contract_id=$1 AND installment='signing'`, [ct]);
  await refused("ledger line with a rate but no AED amount", `INSERT INTO ledger_entries(direction,source,occurred_on,amount_cents,aed_rate) VALUES('outflow','other',current_date,100,3.6725)`);
  await accepted("ledger line with its AED amount", `INSERT INTO ledger_entries(direction,source,occurred_on,amount_cents,currency,aed_rate,amount_aed_cents,description) VALUES('outflow','payroll',current_date,100000,'USD',3.6725,367250,'guard')`);
  await refused("edit a ledger line", `UPDATE ledger_entries SET amount_cents=1 WHERE description='guard'`);
  await refused("delete a ledger line", `DELETE FROM ledger_entries WHERE description='guard'`);

  console.log("== Users");
  await refused("user as their own manager", `UPDATE users SET manager_user_id=id WHERE id=$1`, [emp]);
  await c.query(`UPDATE users SET roles=roles||'{ceo}' WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM users WHERE 'ceo'=ANY(roles) AND disabled_at IS NULL)`, [ceo]);
  await refused("two active CEOs", `UPDATE users SET roles=array_append(roles,'ceo') WHERE id IN ($1,$2)`, [mgr, emp]);
} finally {
  await c.query("ROLLBACK");
  c.release();
  await pool.end();
}
console.log(failures ? `\n${failures} FAILED` : "\nAll database guards held. Transaction rolled back; no rows written.");
process.exit(failures ? 1 : 0);
