import { KpiDashboard } from "@/components/KpiDashboard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getKpis } from "@/lib/kpi";
import { OVERSIGHT_ROLES } from "@/lib/types";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function KPI(){
  const {user}=await getViewer();
  const allowed=!!user&&OVERSIGHT_ROLES.some(r=>user.roles.includes(r));
  const initial=allowed?JSON.parse(JSON.stringify(await getKpis(30))):null;
  return <ProtectedPage roles={OVERSIGHT_ROLES}>{initial&&<KpiDashboard initial={initial}/>}</ProtectedPage>;
}
