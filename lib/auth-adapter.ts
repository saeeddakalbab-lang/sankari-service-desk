import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from "next-auth/adapters";
import { query } from "./db";
import { csv } from "./env";
import type { Role } from "./types";

const rolesFor=(email:string):Role[]=>{
  const e=email.toLowerCase(),roles=new Set<Role>(["employee"]);
  if(csv(process.env.ADMIN_EMAILS).has(e))roles.add("admin");
  if(csv(process.env.BOARD_EMAILS).has(e))roles.add("board");
  if(csv(process.env.AGENT_EMAILS).has(e))roles.add("agent");
  if(csv(process.env.DEV_EMAILS).has(e))roles.add("dev");
  return [...roles];
};
const user=(r:any):AdapterUser&{roles:Role[]}=>({id:r.id,email:r.email,name:r.name,image:r.image,emailVerified:r.email_verified,roles:r.roles});
export const SankariAdapter:Adapter={
  async createUser(data:Omit<AdapterUser,"id">){const r=await query(`INSERT INTO users(email,name,image,email_verified,roles) VALUES(lower($1),$2,$3,$4,$5) RETURNING *`,[data.email,data.name||data.email,data.image,data.emailVerified,rolesFor(data.email)]);return user(r.rows[0]);},
  async getUser(id){const r=await query(`SELECT * FROM users WHERE id=$1 AND disabled_at IS NULL`,[id]);return r.rows[0]?user(r.rows[0]):null;},
  async getUserByEmail(email){const r=await query(`SELECT * FROM users WHERE email=lower($1) AND disabled_at IS NULL`,[email]);return r.rows[0]?user(r.rows[0]):null;},
  async getUserByAccount({provider,providerAccountId}){const r=await query(`SELECT u.* FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.provider=$1 AND a.provider_account_id=$2 AND u.disabled_at IS NULL`,[provider,providerAccountId]);return r.rows[0]?user(r.rows[0]):null;},
  async updateUser(data){const r=await query(`UPDATE users SET email=coalesce(lower($2),email),name=coalesce($3,name),image=coalesce($4,image),email_verified=coalesce($5,email_verified) WHERE id=$1 RETURNING *`,[data.id,data.email,data.name,data.image,data.emailVerified]);return user(r.rows[0]);},
  async deleteUser(id){await query(`DELETE FROM users WHERE id=$1`,[id]);},
  async linkAccount(a:AdapterAccount){await query(`INSERT INTO accounts(user_id,type,provider,provider_account_id,refresh_token,access_token,expires_at,token_type,scope,id_token,session_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(provider,provider_account_id) DO UPDATE SET refresh_token=excluded.refresh_token,access_token=excluded.access_token,expires_at=excluded.expires_at,id_token=excluded.id_token`,[a.userId,a.type,a.provider,a.providerAccountId,a.refresh_token,a.access_token,a.expires_at,a.token_type,a.scope,a.id_token,a.session_state]);},
  async unlinkAccount({provider,providerAccountId}:Pick<AdapterAccount,"provider"|"providerAccountId">){await query(`DELETE FROM accounts WHERE provider=$1 AND provider_account_id=$2`,[provider,providerAccountId]);},
  async createSession(s){const r=await query(`INSERT INTO sessions(session_token,user_id,expires) VALUES($1,$2,$3) RETURNING *`,[s.sessionToken,s.userId,s.expires]);return {sessionToken:r.rows[0].session_token,userId:r.rows[0].user_id,expires:r.rows[0].expires};},
  async getSessionAndUser(token){const r=await query(`SELECT s.session_token,s.expires,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.session_token=$1 AND s.expires>now() AND u.disabled_at IS NULL`,[token]);if(!r.rows[0])return null;return {session:{sessionToken:r.rows[0].session_token,userId:r.rows[0].id,expires:r.rows[0].expires},user:user(r.rows[0])};},
  async updateSession(s){const r=await query(`UPDATE sessions SET expires=coalesce($2,expires) WHERE session_token=$1 RETURNING *`,[s.sessionToken,s.expires]);return r.rows[0]?{sessionToken:r.rows[0].session_token,userId:r.rows[0].user_id,expires:r.rows[0].expires}:null;},
  async deleteSession(token){await query(`DELETE FROM sessions WHERE session_token=$1`,[token]);},
  async createVerificationToken(v){const r=await query(`INSERT INTO verification_tokens(identifier,token,expires) VALUES($1,$2,$3) RETURNING *`,[v.identifier,v.token,v.expires]);return r.rows[0] as VerificationToken;},
  async useVerificationToken({identifier,token}){const r=await query(`DELETE FROM verification_tokens WHERE identifier=$1 AND token=$2 RETURNING *`,[identifier,token]);return (r.rows[0] as VerificationToken)||null;}
};
