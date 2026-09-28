import { LedgerView } from "@/components/LedgerView";
import { ProtectedPage } from "@/components/ProtectedPage";
import { ledgerOverview } from "@/lib/ledger";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export default async function LedgerPage() {
  const { user, t } = await getViewer();
  if (!user || !(user.roles.includes("admin") || user.roles.includes("accountant"))) return <ProtectedPage roles={["admin", "accountant"]}><></></ProtectedPage>;
  const d = await ledgerOverview(user, 12);
  return <ProtectedPage roles={["admin", "accountant"]}>
    <div className="stack"><div className="stack-s"><h1>{t("lg.title")}</h1><p className="soft">{t("lg.lead")}</p></div>
      <LedgerView d={JSON.parse(JSON.stringify(d))} today={new Date().toISOString().slice(0, 10)} /></div>
  </ProtectedPage>;
}
