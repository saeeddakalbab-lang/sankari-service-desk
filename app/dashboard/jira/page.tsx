import type { Metadata } from "next";
import { JiraDashboard } from "@/components/JiraDashboard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getViewer } from "@/lib/view";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dev Team KPI" };
export default async function Jira() {
  const { t } = await getViewer();
  return <ProtectedPage roles={["dev", "admin"]}>
    <div className="stack">
      <div className="stack-s"><h1>{t("jr.title")}</h1><p className="soft">{t("jr.lead")}</p></div>
      <JiraDashboard />
    </div>
  </ProtectedPage>;
}
