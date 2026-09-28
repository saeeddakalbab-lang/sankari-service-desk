import { ProtectedPage } from "@/components/ProtectedPage";
import { RequestList } from "@/components/RequestList";
import { listRequests } from "@/lib/requests";
import { toRows } from "@/lib/rows";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function MyRequests(){
  const {user,t}=await getViewer();
  const rows=user?await toRows(await listRequests(user)):[];
  return <ProtectedPage><header className="page-head"><h1>{t("list.title")}</h1></header><RequestList rows={rows} title={t("list.title")}/></ProtectedPage>;
}
