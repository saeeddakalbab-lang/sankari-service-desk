import { redirect } from "next/navigation";
import { approvalsBadge } from "@/lib/approvals";
import { hasRole } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { ownsSubscriptions } from "@/lib/subscriptions";
import { getViewer } from "@/lib/view";
import { AppShell } from "./AppShell";

// Server-side gate for every page. Hiding a menu item is never the control; this redirect and the API checks are.
export async function ProtectedPage({children,roles}:{children:React.ReactNode;roles?:readonly Role[]}){
  const {user}=await getViewer();
  if(!user)redirect("/login");
  if(roles&&!hasRole(user,[...roles]))redirect("/");
  const approvals=await approvalsBadge(user).catch(()=>({show:user.roles.includes("ceo"),count:0}));
  const ownsSubs=await ownsSubscriptions(user.id).catch(()=>false);
  return <AppShell user={user} approvals={approvals} ownsSubs={ownsSubs}>{children}</AppShell>;
}
