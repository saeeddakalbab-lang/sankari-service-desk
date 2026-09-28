import { ProtectedPage } from "@/components/ProtectedPage";
import { StuckView } from "@/components/StuckView";
import { canSkip } from "@/lib/approvals";
import { listStuck } from "@/lib/oversight";
import { getRules } from "@/lib/rules";
import { OVERSIGHT_ROLES } from "@/lib/types";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function Oversight(){
  const {user}=await getViewer();
  const data=user&&OVERSIGHT_ROLES.some(r=>user.roles.includes(r))?JSON.parse(JSON.stringify(await listStuck())):{rows:[],counts:{open:0,approval:0,fulfilment:0,overdue:0},generatedAt:new Date().toISOString()};
  const rules=await getRules();
  return <ProtectedPage roles={OVERSIGHT_ROLES}><StuckView initial={data} viewerId={user?.id||""} readOnly={!!user?.roles.includes("board")} canSkip={!!user&&canSkip(user)} skipAfterHours={rules.skipAfterHours}/></ProtectedPage>;
}
