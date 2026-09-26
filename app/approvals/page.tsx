import { redirect } from "next/navigation";
import { ApprovalsBoard,type PendingCard } from "@/components/ApprovalsBoard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { listPendingFor } from "@/lib/approvals";
import { refFor } from "@/lib/format";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
const ago=(since:string)=>{const h=Math.max(0,Math.floor((Date.now()-new Date(since).getTime())/3600000));return h<48?`${h}h`:`${Math.floor(h/24)}d`;};

// Only requests where this user holds the current step; listPendingFor filters on the stored approver.
export default async function Approvals(){
  const {user}=await getViewer();if(!user)redirect("/login");
  const rows=await listPendingFor(user);
  const cards:PendingCard[]=JSON.parse(JSON.stringify(rows)).map((r:PendingCard&{created_at:string})=>({...r,ref:refFor(r.type,r.id,r.created_at),waitingFor:ago(r.previous_decided_at||r.created_at)}));
  return <ProtectedPage><ApprovalsBoard cards={cards}/></ProtectedPage>;
}
