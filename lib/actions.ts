import { createHmac, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { refFor } from "./format";
import { queueMail } from "./mail";
import type { RequestRecord, User } from "./types";

// One-time Start / Reject links in the new-ticket email. The token is 32 random bytes; only its
// HMAC (keyed with NEXTAUTH_SECRET) is stored, so neither a database copy nor a guessed value
// opens anything. A link is bound to the person it was sent to, expires, and works once.
export const ACTION_TTL_HOURS = 72;
export type TicketAction = "ticket.start" | "ticket.reject";
export type LinkState = "ok" | "invalid" | "expired" | "used" | "wrong_user" | "not_allowed" | "moot";

const secret = () => { const s = process.env.NEXTAUTH_SECRET; if (!s) throw new Error("NEXTAUTH_SECRET is not set"); return s; };
export const hashToken = (token: string) => createHmac("sha256", secret()).update(token).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function issueTicketLinks(c: PoolClient | null, requestId: string, recipientUserId: string) {
  const run = (sql: string, v: unknown[]) => (c ? c.query(sql, v) : query(sql, v));
  const out: Record<"start" | "reject", string> = { start: "", reject: "" };
  for (const kind of ["start", "reject"] as const) {
    const token = randomBytes(32).toString("base64url");
    await run(`INSERT INTO action_tokens(token_hash,action,request_id,recipient_user_id,expires_at) VALUES($1,$2,$3,$4,now()+($5||' hours')::interval)`,
      [hashToken(token), `ticket.${kind}`, requestId, recipientUserId, String(ACTION_TTL_HOURS)]);
    out[kind] = new URL(`/actions/${token}`, base()).href;
  }
  return out;
}

type Row = { id: string; action: TicketAction; request_id: string; recipient_user_id: string; expires_at: Date; used_at: Date | null; used_by_name: string | null; expired: boolean };
const canAct = (u: User) => u.roles.includes("admin") || u.roles.includes("agent");
// Start is for a ticket nobody has picked up; Reject closes one before work begins.
const OPEN_FOR_ACTION = ["new", "assigned", "reopened"];

function stateOf(row: Row | undefined, req: RequestRecord | undefined, user: User): LinkState {
  if (!row || !req) return "invalid";
  if (row.used_at) return "used";
  if (row.expired) return "expired";
  if (row.recipient_user_id !== user.id) return "wrong_user";
  if (!canAct(user)) return "not_allowed";
  if (req.type !== "helpdesk_ticket" || !OPEN_FOR_ACTION.includes(req.status) || (req.assignee_id && req.assignee_id !== user.id)) return "moot";
  return "ok";
}

const lookup = `SELECT t.id,t.action,t.request_id,t.recipient_user_id,t.expires_at,t.used_at,u.name used_by_name,(t.expires_at<=now()) expired
  FROM action_tokens t LEFT JOIN users u ON u.id=t.used_by_user_id WHERE t.token_hash=$1`;

// Read-only: what the confirm page shows. Never changes anything.
export async function inspectLink(token: string, user: User) {
  if (!TOKEN_RE.test(token)) return { state: "invalid" as LinkState };
  const row = (await query<Row>(lookup, [hashToken(token)])).rows[0];
  const req = row ? (await query<RequestRecord & { assignee_name: string | null }>(`SELECT r.*,a.name assignee_name FROM requests r LEFT JOIN users a ON a.id=r.assignee_id WHERE r.id=$1`, [row.request_id])).rows[0] : undefined;
  const state = stateOf(row, req, user);
  // Someone who was not sent the link learns nothing about the ticket.
  const show = state !== "invalid" && state !== "wrong_user";
  return {
    state, action: row?.action, usedAt: row?.used_at ?? null, usedBy: row?.used_by_name ?? null, expiresAt: row?.expires_at ?? null,
    ticket: show && req ? { id: req.id, ref: refFor(req.type, req.id, String(req.created_at)), subject: req.subject, description: req.description, priority: req.priority, status: req.status,
      requester: req.requester_name, company: req.company, category: String((req.details as Record<string, unknown>)?.category ?? ""), assetTag: String((req.details as Record<string, unknown>)?.assetTag ?? ""), assignee: req.assignee_name } : null,
  };
}

const MESSAGES: Record<Exclude<LinkState, "ok">, [number, string]> = {
  invalid: [404, "This link is not valid."],
  expired: [410, "This link has expired."],
  used: [409, "This link has already been used."],
  wrong_user: [403, "This link was sent to someone else."],
  not_allowed: [403, "Only IT agents and admins can act on tickets."],
  moot: [409, "This ticket has already been picked up or closed."],
};
// Every refused click is audited with the account that made it, outside the rolled-back transaction.
async function refuse(user: User, row: Row | undefined, state: Exclude<LinkState, "ok">, ipHash: string): Promise<never> {
  await query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'ticket.email_link_refused',$3,$4)`,
    [user.id, row?.request_id ?? null, JSON.stringify({ reason: state, action: row?.action ?? null, tokenId: row?.id ?? null }), ipHash]);
  const [status, message] = MESSAGES[state];
  throw new AppError(message, status);
}

// The only way a link changes anything: a POST from a signed-in session.
export async function useLink(token: string, user: User, reasonInput: unknown, ipHash: string) {
  const reason = typeof reasonInput === "string" ? reasonInput.trim().slice(0, 2000) : "";
  const result = await transaction(async c => {
    const row = TOKEN_RE.test(token) ? (await c.query<Row>(`${lookup} FOR UPDATE OF t`, [hashToken(token)])).rows[0] : undefined;
    const req = row ? (await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`, [row.request_id])).rows[0] : undefined;
    const state = stateOf(row, req, user);
    if (state !== "ok") return { refused: state, row };
    // A missing reason is a form error: the link stays unused so the person can try again.
    if (row!.action === "ticket.reject" && reason.length < 3) throw new AppError("A reason is required to reject a ticket", 400);
    await c.query(`UPDATE action_tokens SET used_at=now(),used_by_user_id=$2 WHERE id=$1`, [row!.id, user.id]);
    const old = req!;
    const updated = row!.action === "ticket.start"
      ? await c.query<RequestRecord>(`UPDATE requests SET status='inprogress',assignee_id=$2,assigned_at=coalesce(assigned_at,now()),version=version+1 WHERE id=$1 RETURNING *`, [old.id, user.id])
      : await c.query<RequestRecord>(`UPDATE requests SET status='closed',details=details||$2::jsonb,resolved_at=coalesce(resolved_at,now()),closed_at=coalesce(closed_at,now()),version=version+1 WHERE id=$1 RETURNING *`,
        [old.id, JSON.stringify({ rejectReason: reason, rejectedBy: user.name })]);
    const saved = updated.rows[0];
    if (row!.action === "ticket.reject") await c.query(`INSERT INTO comments(request_id,author_id,author_name,body,internal) VALUES($1,$2,$3,$4,false)`, [old.id, user.id, user.name, `Ticket rejected: ${reason}`]);
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,before_data,after_data,ip_hash) VALUES($1,$2,$3,$4,$5,$6)`,
      [user.id, old.id, row!.action === "ticket.start" ? "ticket.email_start" : "ticket.email_reject", JSON.stringify(old), JSON.stringify({ ...saved, tokenId: row!.id, reason: reason || undefined }), ipHash]);
    return { saved, action: row!.action };
  });
  if ("refused" in result) return refuse(user, result.row, result.refused as Exclude<LinkState, "ok">, ipHash);
  const { saved, action } = result;
  if (action === "ticket.start") await queueMail(`email-start-${saved.version}`, saved, saved.requester_email, "Work has started", `${user.name} has started working on your ticket.`);
  else await queueMail(`email-reject-${saved.version}`, saved, saved.requester_email, "Ticket closed", `${user.name} closed your ticket without action. Reason: ${reason}`);
  return { status: saved.status, requestId: saved.id, action };
}

// New helpdesk tickets since a moment, for the corner toast. Agents and admins only.
export async function newTicketsSince(user: User, after: Date) {
  const r = await query<{ id: string; type: string; subject: string; requester_name: string; priority: string; created_at: Date }>(
    `SELECT id,type,subject,requester_name,priority,created_at FROM requests WHERE type='helpdesk_ticket' AND created_at>$1 AND requester_user_id IS DISTINCT FROM $2 ORDER BY created_at LIMIT 10`, [after, user.id]);
  return r.rows.map(x => ({ id: x.id, ref: refFor(x.type, x.id, String(x.created_at)), subject: x.subject, requester: x.requester_name, priority: x.priority, createdAt: x.created_at }));
}
