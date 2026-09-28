import { MySettings } from "@/components/MySettings";
import { ProtectedPage } from "@/components/ProtectedPage";
import { TeamPanel } from "@/components/TeamPanel";
import { teamState } from "@/lib/team";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
// Language and theme, then who my manager is and who is in my team.
export default async function Settings(){const {theme,locale,user}=await getViewer();const team=user?await teamState(user.id):null;
  return <ProtectedPage><div className="stack" style={{gap:28}}><MySettings theme={theme} locale={locale}/>{team&&<TeamPanel initial={JSON.parse(JSON.stringify(team))} mode="settings"/>}</div></ProtectedPage>;}
