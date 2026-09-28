import { query } from "./db";
import { invitationEmail } from "./invite";
import { typeOf } from "./people";

// Queue the invitation for one person who has not signed in yet. Each send is its own email and is
// audited; the worker delivers it with the embedded logo.
const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
export async function queueInvitation(userId: string, invitedBy: { id: string; name: string }, ipHash: string) {
  const u = (await query<{ id: string; email: string; name: string; roles: string[]; email_verified: string | null; manager: string | null }>(
    `SELECT u.id,u.email,u.name,u.roles,u.email_verified,m.name manager FROM users u LEFT JOIN users m ON m.id=u.manager_user_id WHERE u.id=$1 AND u.disabled_at IS NULL`, [userId])).rows[0];
  if (!u) return { sent: false, reason: "not found" as const };
  if (u.email_verified) return { sent: false, reason: "already signed in" as const };
  const m = invitationEmail({ to: u.email, name: u.name, type: typeOf(u.roles), invitedBy: invitedBy.name, managerName: u.manager, loginUrl: new URL("/login", base()).href });
  await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body) VALUES($1,lower($2),$3,$4,$5)`, [`invite:${u.id}:${Date.now()}`, u.email, m.subject, m.html, m.text]);
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'user.invitation_sent',$2,$3)`, [invitedBy.id, JSON.stringify({ userId: u.id, email: u.email }), ipHash]);
  return { sent: true as const };
}
