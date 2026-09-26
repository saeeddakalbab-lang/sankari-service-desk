import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SankariAdapter } from "./auth-adapter";
import { csv, env } from "./env";
import type { Role, User } from "./types";

const config=()=>env();
export const authOptions:NextAuthOptions={
  adapter:SankariAdapter,
  session:{strategy:"database",maxAge:8*60*60,updateAge:60*60},
  providers:[GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID||"missing",clientSecret:process.env.GOOGLE_CLIENT_SECRET||"missing",authorization:{params:{hd:process.env.GOOGLE_WORKSPACE_DOMAIN||"sankari-holding.com",prompt:"select_account"}},
    // An admin may add a person by email before they first sign in. Google verifies the email and the
    // signIn callback limits it to the company's Workspace domains, so linking that row is safe.
    allowDangerousEmailAccountLinking:true})],
  pages:{signIn:"/login",error:"/login"},
  callbacks:{
    async signIn({user,account,profile}){if(account?.provider!=="google")return false;const email=user.email?.toLowerCase();if(!email||(profile as {email_verified?:boolean}|undefined)?.email_verified===false)return false;
      const {domains}=await import("./settings").then(m=>m.getEmailDomains());const allowed=new Set([config().GOOGLE_WORKSPACE_DOMAIN.toLowerCase(),...domains]);return allowed.has(email.split("@")[1]);},
    async session({session,user}){session.user={id:user.id,email:user.email!,name:user.name||user.email!,image:user.image,roles:((user as any).roles||["employee"]) as Role[]};return session;}
  },
  events:{async signIn({user,profile}){if(!user.email)return;const email=user.email.toLowerCase(),roles=new Set<Role>(["employee"]);if(csv(process.env.ADMIN_EMAILS).has(email))roles.add("admin");if(csv(process.env.BOARD_EMAILS).has(email))roles.add("board");if(csv(process.env.AGENT_EMAILS).has(email))roles.add("agent");if(csv(process.env.DEV_EMAILS).has(email))roles.add("dev");if(csv(process.env.ACCOUNTANT_EMAILS).has(email))roles.add("accountant");await import("./db").then(({query})=>query(`UPDATE users SET roles=ARRAY(SELECT DISTINCT unnest(roles || $2::text[])),
      name=CASE WHEN invited_at IS NOT NULL AND email_verified IS NULL AND $3::text IS NOT NULL THEN $3 ELSE name END,
      image=coalesce(image,$4),email_verified=coalesce(email_verified,now()) WHERE id=$1`,[user.id,[...roles],(profile as {name?:string}|undefined)?.name??null,(profile as {picture?:string}|undefined)?.picture??null]));}},
  secret:process.env.NEXTAUTH_SECRET
};
export async function currentUser():Promise<User|null>{
  if(process.env.NODE_ENV!=="production"&&process.env.AUTH_DEV_BYPASS==="true")return {id:"00000000-0000-4000-8000-000000000001",email:"dev@sankari-holding.com",name:"Development Admin",image:null,roles:["employee","agent","admin","board","dev","accountant"]};
  const session=await getServerSession(authOptions);return session?.user?{...session.user,image:session.user.image??null}:null;
}
export const hasRole=(user:User,roles:Role[])=>roles.some(r=>user.roles.includes(r));
