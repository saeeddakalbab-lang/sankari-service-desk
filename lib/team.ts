import type { PoolClient } from "pg";
import { z } from "zod";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { button, emailShell, para } from "./email-layout";
import { getEmailDomains } from "./settings";
import type { User } from "./types";

// Who reports to whom, agreed by both sides. An employee names their manager (on first sign-in, or in
// Settings); a manager names the people in their team (Settings → My team). As soon as both name each
// other, whichever came first, the employee is placed under that manager: users.manager_user_id is set,
// the manager gets the Manager role, and both are told. One side alone never changes anyone's approver.
// An admin can still set a manager directly in People. Migration 022.

const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
const email = z.string().trim().toLowerCase().email().max(254);
// The CEO, the Owner and the Board have no manager to ask for.
// Only people an admin has made a Manager (and the CEO, who has direct reports) keep a team list.
export const canHaveTeam = (roles: readonly string[]) => roles.includes("manager") || roles.includes("ceo");
export const needsManager = (u: { roles: readonly string[]; manager_user_id?: string | null }) => !u.manager_user_id && !u.roles.some(r => ["ceo", "owner", "board"].includes(r));

async function checkDomain(e: string) {
  const { domains } = await getEmailDomains(), ok = new Set([...domains, (process.env.GOOGLE_WORKSPACE_DOMAIN || "sankari-holding.com").toLowerCase()]);
  if (!ok.has(e.split("@")[1])) throw new AppError(`${e.split("@")[1]} is not one of the company's email domains`);
}
async function mail(key: string, to: string, title: string, lines: string[], link?: { href: string; label: string }) {
  const html = emailShell(title, `${lines.map(para).join("")}${link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:18px">${button(link.href, link.label)}</td></tr></table>` : ""}`);
  await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body) VALUES($1,lower($2),$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`, [key, to, `[Sankari] ${title}`, html, `${title}\n\n${lines.join("\n\n")}${link ? `\n\n${link.label}: ${link.href}` : ""}`]);
}

export type TeamState = {
  needsManager: boolean;
  canHaveTeam: boolean;
  manager: { name: string; email: string } | null;
  claim: { email: string; name: string | null; at: string; knownName: string | null } | null;
  offers: { managerUserId: string; name: string; email: string }[];
  team: { id: string; name: string; email: string }[];
  pending: { email: string; name: string | null; namedYou: boolean; joined: boolean; placed: boolean }[];
};
export async function teamState(userId: string): Promise<TeamState> {
  const me = (await query<{ email: string; roles: string[]; manager_user_id: string | null; manager_claim_email: string | null; manager_claim_name: string | null; manager_claim_at: string | null; mname: string | null; memail: string | null; claimed_name: string | null }>(
    `SELECT u.email,u.roles,u.manager_user_id,u.manager_claim_email,u.manager_claim_name,u.manager_claim_at,m.name mname,m.email memail,c.name claimed_name
       FROM users u LEFT JOIN users m ON m.id=u.manager_user_id LEFT JOIN users c ON lower(c.email)=u.manager_claim_email AND c.disabled_at IS NULL WHERE u.id=$1`, [userId])).rows[0];
  if (!me) throw new AppError("Not found", 404);
  const offers = (await query<{ managerUserId: string; name: string; email: string }>(`SELECT u.id "managerUserId",u.name,u.email FROM team_claims t JOIN users u ON u.id=t.manager_user_id AND u.disabled_at IS NULL WHERE t.employee_email=lower($1) AND t.matched_at IS NULL AND t.manager_user_id<>$2 ORDER BY t.created_at`, [me.email, userId])).rows;
  const team = (await query<{ id: string; name: string; email: string }>(`SELECT id,name,email FROM users WHERE manager_user_id=$1 AND disabled_at IS NULL ORDER BY name`, [userId])).rows;
  const pending = (await query<{ email: string; name: string | null; namedYou: boolean; joined: boolean; placed: boolean }>(`
    SELECT t.employee_email email,u.name,coalesce(u.manager_claim_email=lower($2),false) "namedYou",u.id IS NOT NULL joined,coalesce(u.manager_user_id IS NOT NULL AND u.manager_user_id<>$1,false) placed
      FROM team_claims t LEFT JOIN users u ON lower(u.email)=t.employee_email WHERE t.manager_user_id=$1 AND t.matched_at IS NULL ORDER BY t.created_at`, [userId, me.email])).rows;
  return { needsManager: needsManager(me), canHaveTeam: canHaveTeam(me.roles), manager: me.memail ? { name: me.mname!, email: me.memail } : null,
    claim: me.manager_claim_email && !me.manager_user_id ? { email: me.manager_claim_email, name: me.manager_claim_name, at: me.manager_claim_at!, knownName: me.claimed_name } : null, offers, team, pending };
}

// Both sides agree? Link them. Runs after either side changes, inside one transaction.
async function tryMatch(c: PoolClient, employeeEmail: string) {
  const e = (await c.query<{ id: string; name: string; email: string; manager_claim_email: string | null; manager_user_id: string | null }>(`SELECT id,name,email,manager_claim_email,manager_user_id FROM users WHERE lower(email)=lower($1) AND disabled_at IS NULL FOR UPDATE`, [employeeEmail])).rows[0];
  if (!e || e.manager_user_id || !e.manager_claim_email) return null;
  const m = (await c.query<{ id: string; name: string; email: string; roles: string[] }>(`SELECT id,name,email,roles FROM users WHERE lower(email)=$1 AND disabled_at IS NULL FOR UPDATE`, [e.manager_claim_email])).rows[0];
  if (!m || m.id === e.id) return null;
  const claim = await c.query(`UPDATE team_claims SET matched_at=now() WHERE manager_user_id=$1 AND employee_email=lower($2) AND matched_at IS NULL`, [m.id, e.email]);
  if (!claim.rowCount) return null;
  await c.query(`UPDATE users SET manager_user_id=$2 WHERE id=$1`, [e.id, m.id]);
  if (!m.roles.includes("manager") && !m.roles.includes("ceo")) await c.query(`UPDATE users SET roles=array_append(roles,'manager') WHERE id=$1 AND NOT ('manager'=ANY(roles))`, [m.id]);
  await c.query(`INSERT INTO audit_log(actor_id,action,after_data) VALUES(NULL,'team.matched',$1)`, [JSON.stringify({ employeeId: e.id, employee: e.email, managerId: m.id, manager: m.email })]);
  return { employee: e, manager: m };
}
async function announce(r: Awaited<ReturnType<typeof tryMatch>>) {
  if (!r) return;
  const { employee: e, manager: m } = r;
  await mail(`team-matched:${e.id}:${m.id}:e`, e.email, `${m.name} is now your manager`, [`${m.name} confirmed you in their team. Your subscription requests now go to them first for approval.`, `أكّد ${m.name} انضمامك إلى فريقه. تذهب طلبات الاشتراك الخاصة بك إليه أولاً للموافقة.`]);
  await mail(`team-matched:${e.id}:${m.id}:m`, m.email, `${e.name} is now in your team`, [`${e.name} (${e.email}) named you as their manager and you added them: they are now in your team. You approve their subscription requests first.`, `${e.name} في فريقك الآن. توافق أنت أولاً على طلبات الاشتراك الخاصة به.`], { href: new URL("/approvals", base()).href, label: "Open approvals" });
}

export const teamActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_manager"), email, name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("accept"), managerUserId: z.string().uuid() }),
  z.object({ action: z.literal("add"), email }),
  z.object({ action: z.literal("remove"), email }),
]);
export async function teamAction(user: User, input: z.infer<typeof teamActionSchema>, ipHash: string) {
  const me = (await query<{ email: string; manager_user_id: string | null }>(`SELECT email,manager_user_id FROM users WHERE id=$1`, [user.id])).rows[0];
  if (!me) throw new AppError("Not found", 404);
  if (input.action === "set_manager" || input.action === "accept") {
    if (me.manager_user_id) throw new AppError("You already have a manager. Ask an administrator to change it.", 409);
    let target = input.action === "set_manager" ? { email: input.email, name: input.name } : null;
    if (input.action === "accept") {
      const m = (await query<{ email: string; name: string }>(`SELECT u.email,u.name FROM team_claims t JOIN users u ON u.id=t.manager_user_id AND u.disabled_at IS NULL WHERE t.manager_user_id=$1 AND t.employee_email=lower($2) AND t.matched_at IS NULL`, [input.managerUserId, me.email])).rows[0];
      if (!m) throw new AppError("That manager has not added you to their team", 404);
      target = { email: m.email.toLowerCase(), name: m.name };
    }
    if (target!.email === me.email.toLowerCase()) throw new AppError("You cannot be your own manager");
    await checkDomain(target!.email);
    const r = await transaction(async c => {
      await c.query(`UPDATE users SET manager_claim_email=$2,manager_claim_name=$3,manager_claim_at=now() WHERE id=$1`, [user.id, target!.email, target!.name]);
      await c.query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'team.manager_named',$2,$3)`, [user.id, JSON.stringify({ manager: target!.email, name: target!.name }), ipHash]);
      return tryMatch(c, me.email);
    });
    if (r) await announce(r);
    else {
      // Not matched yet: tell the named manager how to confirm. If they are not a Manager in the portal
      // yet, they have no My team to confirm from, so the admins are told instead.
      const m = (await query<{ email: string; name: string; roles: string[] }>(`SELECT email,name,roles FROM users WHERE lower(email)=$1 AND disabled_at IS NULL`, [target!.email])).rows[0];
      if (m && !canHaveTeam(m.roles)) for (const a of (await query<{ email: string }>(`SELECT email FROM users WHERE 'admin'=ANY(roles) AND disabled_at IS NULL`)).rows)
        await mail(`team-needs-manager:${user.id}:${target!.email}:${a.email}`, a.email, `${user.name} named ${m.name} as their manager`, [`${user.name} (${me.email}) named ${m.name} (${m.email}) as their manager, but ${m.name} is not a Manager in the portal yet. If that is right, give them the Manager role in Admin settings → People; they can then confirm ${user.name} in Settings → My team.`], { href: new URL("/admin/settings", base()).href, label: "Open People" });
      else if (m) await mail(`team-asked:${user.id}:${target!.email}`, m.email, `${user.name} says you are their manager`, [`${user.name} (${me.email}) named you as their manager in the IT portal. If that is right, add them in Settings → My team: they join your team and you approve their subscription requests first.`, `ذكرك ${user.name} كمدير له في بوابة تقنية المعلومات. إن كان ذلك صحيحًا فأضفه من الإعدادات ← فريقي.`], { href: new URL("/settings#team", base()).href, label: "Open My team" });
    }
    return { matched: !!r };
  }
  // The team list is for managers only (an admin gives the role in People).
  if (!canHaveTeam(user.roles)) throw new AppError("Only managers keep a team. An administrator can give you the Manager role.", 403);
  if (input.action === "add") {
    if (input.email === me.email.toLowerCase()) throw new AppError("You cannot add yourself to your team");
    await checkDomain(input.email);
    const r = await transaction(async c => {
      await c.query(`INSERT INTO team_claims(manager_user_id,employee_email) VALUES($1,$2) ON CONFLICT DO NOTHING`, [user.id, input.email]);
      await c.query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'team.member_named',$2,$3)`, [user.id, JSON.stringify({ employee: input.email }), ipHash]);
      return tryMatch(c, input.email);
    });
    if (r) await announce(r);
    else {
      const e = (await query<{ email: string; name: string; manager_user_id: string | null }>(`SELECT email,name,manager_user_id FROM users WHERE lower(email)=$1 AND disabled_at IS NULL`, [input.email])).rows[0];
      if (e && !e.manager_user_id) await mail(`team-offer:${user.id}:${input.email}`, e.email, `${user.name} added you to their team`, [`${user.name} added you to their team in the IT portal. If they are your manager, confirm it on your dashboard: one click.`, `أضافك ${user.name} إلى فريقه في بوابة تقنية المعلومات. إن كان مديرك فأكّد ذلك من لوحة التحكم بنقرة واحدة.`], { href: new URL("/portal", base()).href, label: "Confirm on the dashboard" });
    }
    return { matched: !!r };
  }
  const del = await query(`DELETE FROM team_claims WHERE manager_user_id=$1 AND employee_email=$2 AND matched_at IS NULL`, [user.id, input.email]);
  if (del.rowCount) await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'team.member_unnamed',$2,$3)`, [user.id, JSON.stringify({ employee: input.email }), ipHash]);
  return { removed: !!del.rowCount };
}
