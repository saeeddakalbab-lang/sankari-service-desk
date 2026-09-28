import { ProtectedPage } from "@/components/ProtectedPage";
import { StartCards } from "@/components/StartCards";
import { getRules } from "@/lib/rules";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function NewRequest(){
  const {t}=await getViewer();
  return <ProtectedPage><header className="page-head"><div className="stack-s"><h1>{t("req.newTitle")}</h1><p className="lead soft">{t("dash.startHint")}</p></div></header><StartCards t={t} approvalTypes={(await getRules()).approvalTypes}/></ProtectedPage>;
}
