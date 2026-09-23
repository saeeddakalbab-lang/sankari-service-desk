import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SankariAdapter } from "./auth-adapter";
import { csv, env } from "./env";
import type { Role, User } from "./types";

const config=()=>env();
export const authOptions:NextAuthOptions={
  adapter:SankariAdapter,
  session:{strategy:"database",maxAge:8*60*60,updateAge:60*60},
  providers:[GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID||"missing",clientSecret:process.env.GOOGLE_CLIENT_SECRET||"missing",authorization:{params:{hd:process.env.GOOGLE_WORKSPACE_DOMAIN||"sankari-holding.com",prompt:"select_account"}}})],
  pages:{signIn:"/login",error:"/login"},
  callbacks:{
    async signIn({user,account,profile}){if(account?.provider!=="google")return false;const domain=config().GOOGLE_WORKSPACE_DOMAIN.toLowerCase();const email=user.email?.toLowerCase();return !!email&&email.endsWith("@"+domain)&&(profile as {email_verified?:boolean}|undefined)?.email_verified!==false;},
    async session({session,user}){session.user={id:user.id,email:user.email!,name:user.name||user.email!,image:user.image,roles:((user as any).roles||["employee"]) as Role[]};return session;}
  },
  events:{async signIn({user}){if(!user.email)return;const email=user.email.toLowerCase(),roles=new Set<Role>(["employee"]);if(csv(process.env.ADMIN_EMAILS).has(email))roles.add("admin");if(csv(process.env.BOARD_EMAILS).has(email))roles.add("board");if(csv(process.env.AGENT_EMAILS).has(email))roles.add("agent");if(csv(process.env.DEV_EMAILS).has(email))roles.add("dev");if(csv(process.env.ACCOUNTANT_EMAILS).has(email))roles.add("accountant");await import("./db").then(({query})=>query(`UPDATE users SET roles=ARRAY(SELECT DISTINCT unnest(roles || $2::text[])) WHERE id=$1`,[user.id,[...roles]]));}},
  secret:process.env.NEXTAUTH_SECRET
};
export async function currentUser():Promise<User|null>{
  if(process.env.NODE_ENV!=="production"&&process.env.AUTH_DEV_BYPASS==="true")return {id:"00000000-0000-4000-8000-000000000001",email:"dev@sankari-holding.com",name:"Development Admin",image:null,roles:["employee","agent","admin","board","dev","accountant"]};
  const session=await getServerSession(authOptions);return session?.user?{...session.user,image:session.user.image??null}:null;
}
export const hasRole=(user:User,roles:Role[])=>roles.some(r=>user.roles.includes(r));
