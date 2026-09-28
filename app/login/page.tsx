import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/LoginScreen";
import { homeFor } from "@/lib/lines";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}){
  const [{user,theme},q]=await Promise.all([getViewer(),searchParams]);
  // Only an email-action path may be a return target, so the login page cannot be used as an open redirect.
  const next=typeof q.next==="string"&&/^\/actions\/[A-Za-z0-9_-]{43}$/.test(q.next)?q.next:null;
  if(user)redirect(next||homeFor(user.roles));
  return <LoginScreen domain={process.env.GOOGLE_WORKSPACE_DOMAIN||"sankari-holding.com"} denied={!!q.error} theme={theme} next={next}/>;
}
